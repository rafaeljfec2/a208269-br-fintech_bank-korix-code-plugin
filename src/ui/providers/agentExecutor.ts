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
  ContextQualityTelemetryBuffer,
  type ContextQualityBenchmarkSummary,
} from "@korix/context-compiler";
import {
  ModeSwitchAdvisor,
  type ModeSwitchRecommendation,
  type RuntimeExecutionPlan,
  TaskAnalyzer,
  type ThinkingRunProfile,
  ThinkingOrchestrator,
  InteractionContextCompiler,
  RuntimeExecutionPathResolver,
  type ToolUsePolicy,
  ToolUsePolicyResolver,
  WorkspaceEvidenceCollector,
} from "../../core/runtime/thinking";
import { DirectLlmExecutor } from "../../core/runtime/DirectLlmExecutor";
import { RuntimeMetrics } from "../../core/runtime/runtimeMetrics";
import { askSingleChoice } from "../../core/runtime/userQuestion";
import type { ExecutionContext, Mode } from "../../core/types";
import type { ChatHistoryMessage } from "../../core/runtime/thinking/InteractionContextCompiler";
import type { AIProvider } from "../../core/providers/types";
import type { ProviderConfig, ProviderType } from "../../providers/types";
import { AgentEvidencePackBuilder } from "./agentEvidencePackBuilder";
import { ContextQualityRuntimeTelemetry } from "./contextQualityRuntimeTelemetry";

interface PlannedInteraction {
  readonly compiledInteraction: {
    readonly previousMessages: readonly ChatHistoryMessage[];
  };
  readonly effectiveContent: string;
  readonly context: ExecutionContext;
  readonly taskProfile: ThinkingRunProfile;
  readonly toolUsePolicy: ToolUsePolicy;
  readonly executionPlan: RuntimeExecutionPlan;
}

interface RuntimeProviderSelection {
  readonly provider?: ProviderType;
  readonly model?: string;
}

interface ModeSwitchResolution {
  readonly mode: Mode;
  readonly planned: PlannedInteraction;
  readonly declined: boolean;
}

export class AgentExecutor {
  private readonly interactionContextCompiler =
    new InteractionContextCompiler();
  private readonly modeSwitchAdvisor = new ModeSwitchAdvisor();
  private readonly evidencePackBuilder: AgentEvidencePackBuilder;
  private readonly contextQualityRuntimeTelemetry: ContextQualityRuntimeTelemetry;

  constructor(
    private readonly logger: Logger,
    private readonly stateManager: RuntimeStateManager,
    private readonly configManager: ProviderConfigManager,
    private readonly agentLoopFactory: AgentLoopFactory,
    private readonly toolRegistry: ToolRegistry,
    private readonly eventEmitter: RuntimeEventEmitter,
    contextEngine: ContextEngine,
    private readonly onModeSelected?: (mode: Mode) => void,
    contextQualityTelemetry = new ContextQualityTelemetryBuffer(),
  ) {
    this.contextQualityRuntimeTelemetry = new ContextQualityRuntimeTelemetry(
      logger,
      eventEmitter,
      contextQualityTelemetry,
    );
    this.evidencePackBuilder = new AgentEvidencePackBuilder(
      contextEngine,
      (contextIr) =>
        this.contextQualityRuntimeTelemetry.setContextIr(contextIr),
    );
  }

  /**
   * Execute agent loop with user message and history
   */
  async execute(
    content: string,
    previousMessages: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
    interactionMode: Mode,
    providerSelection: RuntimeProviderSelection = {},
  ): Promise<void> {
    this.logger.info("User message received", {
      length: content.length,
      historyLength: previousMessages.length,
      lastHistoryRole: previousMessages.at(-1)?.role,
      mode: interactionMode,
    });

    try {
      // Get provider config
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      // Capture the interaction mode once at send time. A mode change during
      // execution applies to the next user message, not this run.
      let mode = interactionMode;
      let planned = this.planInteraction(content, previousMessages, mode);
      const providerConfig = await this.configManager.getConfig(providerType);
      if (!providerConfig) {
        vscode.window.showErrorMessage(
          `Provider ${providerType} not configured. Please set API key.`,
        );
        return;
      }
      const effectiveProviderConfig =
        providerSelection.provider === providerType && providerSelection.model
          ? { ...providerConfig, model: providerSelection.model }
          : providerConfig;

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(
        effectiveProviderConfig,
      );

      try {
        const modeSwitchResolution = await this.resolveModeSwitch({
          content,
          previousMessages,
          mode,
          planned,
          provider,
        });

        if (modeSwitchResolution.declined) {
          return;
        }

        mode = modeSwitchResolution.mode;
        planned = modeSwitchResolution.planned;

        // Build unified system prompt
        const contextBuilder = new PluginContextBuilder(
          this.toolRegistry,
          this.logger,
        );

        if (planned.executionPlan.path === "direct_llm") {
          await this.runDirectLlmExecution({
            content,
            previousMessages,
            mode,
            planned,
            provider,
            providerType,
            providerConfig: effectiveProviderConfig,
            contextBuilder,
          });
          return;
        }

        const systemPrompt = contextBuilder.build({
          mode,
          providerType,
          model: effectiveProviderConfig.model,
          maxIterations: 25,
        });

        // Create AgentLoop with system prompt
        const agentLoop = this.agentLoopFactory.createAgentLoop(
          provider,
          systemPrompt,
          {
            maxTokens: effectiveProviderConfig.maxTokens,
          },
        );

        this.stateManager.prepareInteraction(planned.context);

        // Mark as executing
        this.stateManager.startExecution();
        this.contextQualityRuntimeTelemetry.reset();
        const detachContextQualityTelemetry =
          this.contextQualityRuntimeTelemetry.attach();

        const orchestrator = new ThinkingOrchestrator({
          agentLoop,
          eventEmitter: this.eventEmitter,
          logger: this.logger,
          evidenceProvider: (request) =>
            this.evidencePackBuilder.build(request),
          workspaceEvidenceCollector: (request) =>
            new WorkspaceEvidenceCollector(this.toolRegistry).collect(request),
        });

        // Run thinking orchestrator with history and process events
        const generator = orchestrator.run({
          initialMessage: planned.effectiveContent,
          context: planned.context,
          previousMessages: planned.compiledInteraction.previousMessages,
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
          detachContextQualityTelemetry();
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

  private buildExecutionContext(mode: Mode): ExecutionContext {
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

  private async resolveModeSwitch(options: {
    readonly content: string;
    readonly previousMessages: readonly ChatHistoryMessage[];
    readonly mode: Mode;
    readonly planned: PlannedInteraction;
    readonly provider: AIProvider;
  }): Promise<ModeSwitchResolution> {
    const modeSwitch = await this.modeSwitchAdvisor.resolve({
      message: options.planned.effectiveContent,
      profile: options.planned.taskProfile,
      context: options.planned.context,
      executionPlan: options.planned.executionPlan,
      provider: options.provider,
    });

    if (!modeSwitch) {
      return {
        mode: options.mode,
        planned: options.planned,
        declined: false,
      };
    }

    const selectedMode = await this.askModeSwitch(modeSwitch);
    if (selectedMode === modeSwitch.currentMode) {
      this.emitModeSwitchDeclined(modeSwitch);
      return {
        mode: options.mode,
        planned: options.planned,
        declined: true,
      };
    }

    this.stateManager.setMode(selectedMode);
    this.onModeSelected?.(selectedMode);

    return {
      mode: selectedMode,
      planned: this.planInteraction(
        options.content,
        options.previousMessages,
        selectedMode,
      ),
      declined: false,
    };
  }

  private async runDirectLlmExecution(options: {
    readonly content: string;
    readonly previousMessages: readonly ChatHistoryMessage[];
    readonly mode: Mode;
    readonly planned: PlannedInteraction;
    readonly provider: AIProvider;
    readonly providerType: ProviderType;
    readonly providerConfig: ProviderConfig;
    readonly contextBuilder: PluginContextBuilder;
  }): Promise<void> {
    const directInteraction = this.interactionContextCompiler.compile({
      message: options.content,
      previousMessages: options.previousMessages,
      mode: options.mode,
      maxPreviousMessages: options.planned.executionPlan.maxHistoryMessages,
      maxPreviousChars: options.planned.executionPlan.maxHistoryChars,
    });
    const systemPrompt = options.contextBuilder.buildDirectAnswer({
      mode: options.mode,
      providerType: options.providerType,
      model: options.providerConfig.model,
      profile: options.planned.executionPlan.profile,
    });
    const maxTokens = Math.min(
      options.providerConfig.maxTokens ??
        options.planned.executionPlan.maxTokens ??
        1536,
      options.planned.executionPlan.maxTokens ?? 1536,
    );

    this.stateManager.prepareInteraction(options.planned.context);
    this.stateManager.startExecution();

    try {
      await new DirectLlmExecutor(
        options.provider,
        this.eventEmitter,
        this.logger,
      ).run({
        initialMessage: directInteraction.effectiveMessage,
        previousMessages: directInteraction.previousMessages,
        context: options.planned.context,
        systemPrompt,
        maxTokens,
      });
    } finally {
      this.stateManager.stopExecution();
    }

    this.logger.info("Direct LLM execution completed successfully", {
      reason: options.planned.executionPlan.reason,
    });
  }

  private planInteraction(
    content: string,
    previousMessages: readonly ChatHistoryMessage[],
    mode: Mode,
  ): PlannedInteraction {
    const compiledInteraction = this.interactionContextCompiler.compile({
      message: content,
      previousMessages,
      mode,
    });
    const effectiveContent = compiledInteraction.effectiveMessage;
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

    return {
      compiledInteraction,
      effectiveContent,
      context,
      taskProfile,
      toolUsePolicy,
      executionPlan,
    };
  }

  private async askModeSwitch(
    recommendation: ModeSwitchRecommendation,
  ): Promise<Mode> {
    const answer = await askSingleChoice(
      this.eventEmitter,
      recommendation.title,
      recommendation.question,
      recommendation.options.map((option) => ({
        value: option.mode,
        label: option.label,
        description: option.description,
      })),
      60000,
    );

    return this.isMode(answer) ? answer : recommendation.recommendedMode;
  }

  private emitModeSwitchDeclined(
    recommendation: ModeSwitchRecommendation,
  ): void {
    const metrics = new RuntimeMetrics(this.logger);
    const context = this.buildExecutionContext(recommendation.currentMode);
    this.stateManager.prepareInteraction(context);
    this.stateManager.startExecution();

    try {
      this.eventEmitter.emitEvent({
        type: "token",
        content: `Mantive o modo ${recommendation.currentMode.toUpperCase()}. Para esse pedido, mude para ${recommendation.recommendedMode.toUpperCase()} quando quiser que eu continue.`,
        timestamp: Date.now(),
      });
      this.eventEmitter.emitEvent({
        type: "done",
        stopReason: "mode_switch_declined",
        timestamp: Date.now(),
      });
      this.eventEmitter.emitEvent({
        type: "execution_complete",
        success: true,
        iterations: 0,
        metrics: metrics.finalize(),
        timestamp: Date.now(),
      });
    } finally {
      this.stateManager.stopExecution();
    }
  }

  private isMode(value: string): value is Mode {
    return value === "ask" || value === "plan" || value === "agent";
  }

  getContextQualityTelemetrySummary(): ContextQualityBenchmarkSummary {
    return this.contextQualityRuntimeTelemetry.summarize();
  }
}
