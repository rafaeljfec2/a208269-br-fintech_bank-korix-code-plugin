/**
 * AgentExecutor - Handles agent loop execution
 * Extracted from MessageHandler to reduce file size
 */

import * as vscode from "vscode";
import type { Logger } from "../../telemetry/logger";
import type { RuntimeStateManager } from "../../core/runtime/runtimeStateManager";
import type { ProviderConfigManager } from "../../providers/config";
import type { AgentLoopFactory } from "./agentLoopFactory";
import { PluginContextBuilder } from "../../prompts/pluginContext";
import type { ToolRegistry } from "../../harness/toolRegistry";
import type { RuntimeEventEmitter } from "../../core/runtime/runtimeEvents";
import type { ContextEngine } from "../../context/contextEngine";
import {
  TaskAnalyzer,
  ThinkingOrchestrator,
  InteractionContextCompiler,
  RuntimeExecutionPathResolver,
  ToolUsePolicyResolver,
  WorkspaceEvidenceCollector,
} from "../../core/runtime/thinking";
import { DirectLlmExecutor } from "../../core/runtime/DirectLlmExecutor";
import type {
  EvidencePack,
  EvidenceRequest,
} from "../../core/runtime/thinking";
import type { ExecutionContext } from "../../core/types";

export class AgentExecutor {
  private readonly interactionContextCompiler =
    new InteractionContextCompiler();

  constructor(
    private readonly logger: Logger,
    private readonly stateManager: RuntimeStateManager,
    private readonly configManager: ProviderConfigManager,
    private readonly agentLoopFactory: AgentLoopFactory,
    private readonly toolRegistry: ToolRegistry,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly contextEngine: ContextEngine,
  ) {}

  /**
   * Execute agent loop with user message and history
   */
  async execute(
    content: string,
    previousMessages: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
    interactionMode: "ask" | "plan" | "agent",
  ): Promise<void> {
    this.logger.info("User message received", {
      length: content.length,
      historyLength: previousMessages.length,
      lastHistoryRole: previousMessages[previousMessages.length - 1]?.role,
      mode: interactionMode,
    });

    try {
      // Get provider config
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      const providerConfigPromise = this.configManager.getConfig(providerType);

      // Capture the interaction mode once at send time. A mode change during
      // execution applies to the next user message, not this run.
      const mode = interactionMode;
      const compiledInteraction = this.interactionContextCompiler.compile({
        message: content,
        previousMessages,
        mode,
      });
      const effectiveContent = compiledInteraction.effectiveMessage;

      // Prepare execution context before choosing the runtime path.
      const context = this.buildExecutionContext(mode);
      const taskProfile = new TaskAnalyzer().analyze(effectiveContent, context);
      const toolUsePolicy = new ToolUsePolicyResolver().resolve(
        effectiveContent,
        taskProfile,
        context,
      );
      const executionPlan = new RuntimeExecutionPathResolver().resolve({
        message: effectiveContent,
        profile: taskProfile,
        context,
        toolUsePolicy,
      });

      const providerConfig = await providerConfigPromise;
      if (!providerConfig) {
        vscode.window.showErrorMessage(
          `Provider ${providerType} not configured. Please set API key.`,
        );
        return;
      }

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(providerConfig);

      // Build unified system prompt
      const contextBuilder = new PluginContextBuilder(
        this.toolRegistry,
        this.logger,
      );

      try {
        if (executionPlan.path === "direct_llm") {
          const directInteraction = this.interactionContextCompiler.compile({
            message: content,
            previousMessages,
            mode,
            maxPreviousMessages: executionPlan.maxHistoryMessages,
            maxPreviousChars: executionPlan.maxHistoryChars,
          });
          const systemPrompt = contextBuilder.buildDirectAnswer({
            mode,
            providerType,
            model: providerConfig.model,
            profile: executionPlan.profile,
          });
          const maxTokens = Math.min(
            providerConfig.maxTokens ?? executionPlan.maxTokens ?? 1536,
            executionPlan.maxTokens ?? 1536,
          );

          this.stateManager.prepareInteraction(context);
          this.stateManager.startExecution();

          try {
            await new DirectLlmExecutor(
              provider,
              this.eventEmitter,
              this.logger,
            ).run({
              initialMessage: directInteraction.effectiveMessage,
              previousMessages: directInteraction.previousMessages,
              context,
              systemPrompt,
              maxTokens,
            });
          } finally {
            this.stateManager.stopExecution();
          }

          this.logger.info("Direct LLM execution completed successfully", {
            reason: executionPlan.reason,
          });
          return;
        }

        const systemPrompt = contextBuilder.build({
          mode,
          providerType,
          model: providerConfig.model,
          maxIterations: 25,
        });

        // Create AgentLoop with system prompt
        const agentLoop = this.agentLoopFactory.createAgentLoop(provider, systemPrompt, {
          maxTokens: providerConfig.maxTokens,
        });

        this.stateManager.prepareInteraction(context);

        // Mark as executing
        this.stateManager.startExecution();

        const orchestrator = new ThinkingOrchestrator({
          agentLoop,
          eventEmitter: this.eventEmitter,
          logger: this.logger,
          evidenceProvider: (request) => this.buildEvidencePack(request),
          workspaceEvidenceCollector: (request) =>
            new WorkspaceEvidenceCollector(this.toolRegistry).collect(request),
        });

        // Run thinking orchestrator with history and process events
        const generator = orchestrator.run({
          initialMessage: effectiveContent,
          context,
          previousMessages: compiledInteraction.previousMessages,
        });

        try {
          for await (const event of generator) {
            try {
              this.logger.debug("Runtime event from generator", {
                type: event.type,
              });

              // FIX: Re-emit generator events via RuntimeEventEmitter
              // AgentLoop yields lifecycle events (done, execution_complete, etc)
              // but they must be explicitly emitted to reach MessageHandler → webview
              this.eventEmitter.emitEvent(event);
            } catch (eventError) {
              this.logger.error("Failed to process runtime event", eventError);
              // Continue iteration - don't let event processing errors stop the loop
            }
          }

          this.logger.info("Agent loop completed successfully");
        } catch (error) {
          this.logger.error("Agent loop failed", error);
          vscode.window.showErrorMessage(
            `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          this.stateManager.stopExecution();
        }
      } finally {
        await provider.dispose();
      }
    } catch (error) {
      this.logger.error("Failed to initialize agent loop", error);
      this.stateManager.stopExecution();
      vscode.window.showErrorMessage(
        `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildExecutionContext(
    mode: "ask" | "plan" | "agent",
  ): ExecutionContext {
    const activeEditor = vscode.window.activeTextEditor;
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const openFiles = Array.from(vscode.workspace.textDocuments)
      .filter((document) => document.uri.scheme === "file")
      .map((document) => document.uri.fsPath);

    const selection = activeEditor?.selection;
    const selectedText = selection
      ? activeEditor.document.getText(selection)
      : "";

    return {
      mode,
      workspaceRoot,
      currentFile: activeEditor?.document.uri.fsPath,
      selection:
        selection && selectedText.length > 0
          ? {
              start: {
                line: selection.start.line,
                character: selection.start.character,
              },
              end: {
                line: selection.end.line,
                character: selection.end.character,
              },
              text: selectedText,
            }
          : undefined,
      openFiles,
    };
  }

  private async buildEvidencePack(
    request: EvidenceRequest,
  ): Promise<EvidencePack> {
    const tokenBudget = Math.min(
      vscode.workspace
        .getConfiguration("korix")
        .get<number>("contextTokenBudget", 180000),
      24000,
    );

    const range = request.context.selection
      ? new vscode.Range(
          request.context.selection.start.line,
          request.context.selection.start.character,
          request.context.selection.end.line,
          request.context.selection.end.character,
        )
      : undefined;

    const contextWindow = await this.contextEngine.buildContext({
      currentFile: request.context.currentFile,
      userSelection:
        request.context.currentFile && range
          ? { file: request.context.currentFile, range }
          : undefined,
      mentionedSymbols: [...request.profile.mentionedSymbols],
      tokenBudget,
    });

    return {
      summary: `${contextWindow.items.length} workspace item(s), ${contextWindow.totalTokens} estimated tokens.`,
      providerContext: this.contextEngine.formatContext(contextWindow),
      items: contextWindow.items.map((item) => ({
        path: item.file,
        priority: item.priority,
        tokenCount: item.tokenCount,
      })),
      totalTokens: contextWindow.totalTokens,
    };
  }
}
