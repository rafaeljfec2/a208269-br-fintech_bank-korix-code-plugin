import * as vscode from "vscode";
import type { Mode } from "../core/types";
import type { Container } from "../di/container";
import { TOKENS } from "../di/tokens";
import type { Logger } from "../telemetry/logger";
import type { RuntimeStateManager } from "../core/runtime/runtimeStateManager";
import type { ProviderConfigManager } from "../providers/config";
import type { ProviderType } from "../providers/types";
import type { CheckpointManager } from "../core/runtime/checkpoints";
import type { ToolRegistry } from "../harness/toolRegistry";
import { PermissionManager } from "../harness/permissions";
import type {
  ExecutionCompleteEvent,
  RuntimeEventEmitter,
} from "../core/runtime/runtimeEvents";
import type { ContextEngine } from "../context/contextEngine";
import { AgentLoopFactory } from "./providers/agentLoopFactory";
import { PluginContextBuilder } from "../prompts/pluginContext";
import {
  InteractionContextCompiler,
  RuntimeExecutionPathResolver,
  TaskAnalyzer,
  ThinkingOrchestrator,
  ToolUsePolicyResolver,
  WorkspaceEvidenceCollector,
} from "../core/runtime/thinking";
import { DirectLlmExecutor } from "../core/runtime/DirectLlmExecutor";
import {
  addOpenPanelButton,
  buildChatParticipantCompletionMarkdown,
  buildEvidencePack,
  buildExecutionContext,
  CHAT_COMMAND_MODES,
  forwardRuntimeEvent,
  metadata,
  requestApprovalInChat,
  toPreviousMessages,
} from "./chatParticipantSupport";

export const KORIX_CHAT_PARTICIPANT_ID = "korix-code.korix";

interface RegisterKorixChatParticipantOptions {
  readonly extensionUri: vscode.Uri;
  readonly container: Container;
  readonly onModeSelected: (mode: Mode) => void;
}

export function registerKorixChatParticipant(
  options: RegisterKorixChatParticipantOptions,
): vscode.Disposable {
  const runner = new KorixChatParticipantRunner(
    options.container,
    options.onModeSelected,
  );
  const participant = vscode.chat.createChatParticipant(
    KORIX_CHAT_PARTICIPANT_ID,
    (request, context, response, token) =>
      runner.handleRequest(request, context, response, token),
  );

  participant.iconPath = vscode.Uri.joinPath(
    options.extensionUri,
    "resources",
    "sidebar-icon.svg",
  );
  participant.followupProvider = {
    provideFollowups: () => [
      {
        label: "Continue in Agent mode",
        prompt: "continue",
        participant: KORIX_CHAT_PARTICIPANT_ID,
        command: "agent",
      },
    ],
  };

  return participant;
}

class KorixChatParticipantRunner {
  private readonly interactionContextCompiler =
    new InteractionContextCompiler();
  private readonly logger: Logger;
  private readonly stateManager: RuntimeStateManager;
  private readonly configManager: ProviderConfigManager;
  private readonly checkpointManager: CheckpointManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly eventEmitter: RuntimeEventEmitter;
  private readonly contextEngine: ContextEngine;

  constructor(
    private readonly container: Container,
    private readonly onModeSelected: (mode: Mode) => void,
  ) {
    this.logger = container.get<Logger>(TOKENS.Logger);
    this.stateManager = container.get<RuntimeStateManager>(
      TOKENS.RuntimeStateManager,
    );
    this.configManager = container.get<ProviderConfigManager>(
      TOKENS.ProviderConfigManager,
    );
    this.checkpointManager = container.get<CheckpointManager>(
      TOKENS.CheckpointManager,
    );
    this.toolRegistry = container.get<ToolRegistry>(TOKENS.ToolRegistry);
    this.eventEmitter = container.get<RuntimeEventEmitter>(
      TOKENS.RuntimeEventEmitter,
    );
    this.contextEngine = container.get<ContextEngine>(TOKENS.ContextEngine);
  }

  async handleRequest(
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    const mode = this.resolveMode(request.command);
    const prompt = request.prompt.trim();

    this.onModeSelected(mode);
    this.stateManager.setMode(mode);

    if (prompt.length === 0) {
      response.markdown(
        `Korix Code está pronto em **${mode.toUpperCase()}** mode. Envie uma tarefa ou use \`/ask\`, \`/plan\` ou \`/agent\`.`,
      );
      addOpenPanelButton(response);
      return { metadata: metadata(mode, request.command) };
    }

    if (this.stateManager.isExecuting()) {
      response.markdown(
        "Korix já está executando outra interação. Aguarde terminar ou cancele a execução atual.",
      );
      addOpenPanelButton(response);
      return {
        errorDetails: {
          message: "Korix is already executing another interaction.",
        },
        metadata: metadata(mode, request.command),
      };
    }

    if (token.isCancellationRequested) {
      return { metadata: metadata(mode, request.command) };
    }

    const providerType = vscode.workspace
      .getConfiguration("korix")
      .get<ProviderType>("provider", "anthropic");
    const providerConfigPromise = this.configManager.getConfig(providerType);

    let streamedText = "";
    let toolCallCount = 0;
    let failedToolCount = 0;
    let completionEvent: ExecutionCompleteEvent | undefined;

    const subscription = this.eventEmitter.onEvent((event) => {
      if (event.type === "tool_call") {
        toolCallCount += 1;
      }

      if (event.type === "tool_result" && !event.success) {
        failedToolCount += 1;
      }

      if (event.type === "execution_complete") {
        completionEvent = event;
      }

      const tokenText = forwardRuntimeEvent(event, response);
      streamedText += tokenText;
    });

    try {
      response.progress(`Korix ${mode.toUpperCase()} mode`);
      addOpenPanelButton(response);

      const previousMessages = toPreviousMessages(chatContext);
      const compiledInteraction = this.interactionContextCompiler.compile({
        message: prompt,
        previousMessages,
        mode,
      });
      const effectivePrompt = compiledInteraction.effectiveMessage;
      const executionContext = buildExecutionContext(mode);
      const taskProfile = new TaskAnalyzer().analyze(
        effectivePrompt,
        executionContext,
      );
      const toolUsePolicy = new ToolUsePolicyResolver().resolve(
        effectivePrompt,
        taskProfile,
        executionContext,
      );
      const executionPlan = new RuntimeExecutionPathResolver().resolve({
        message: effectivePrompt,
        profile: taskProfile,
        context: executionContext,
        toolUsePolicy,
      });
      const providerConfig = await providerConfigPromise;

      if (!providerConfig) {
        response.markdown(
          `Provider **${providerType}** não configurado. Configure as credenciais do Korix antes de usar o participante de Chat.`,
        );
        addOpenPanelButton(response);
        return {
          errorDetails: {
            message: `Provider ${providerType} is not configured.`,
          },
          metadata: metadata(mode, request.command),
        };
      }

      const permissionManager = new PermissionManager((approvalRequest) =>
        requestApprovalInChat(approvalRequest, response, token),
      );
      const agentLoopFactory = new AgentLoopFactory(
        this.container,
        this.logger,
        this.eventEmitter,
        this.checkpointManager,
        permissionManager,
      );
      const provider = agentLoopFactory.createProvider(providerConfig);
      const contextBuilder = new PluginContextBuilder(
        this.toolRegistry,
        this.logger,
      );

      try {
        if (executionPlan.path === "direct_llm") {
          const directInteraction = this.interactionContextCompiler.compile({
            message: prompt,
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

          this.stateManager.prepareInteraction(executionContext);
          this.stateManager.startExecution();

          await new DirectLlmExecutor(
            provider,
            this.eventEmitter,
            this.logger,
          ).run({
            initialMessage: directInteraction.effectiveMessage,
            previousMessages: directInteraction.previousMessages,
            context: executionContext,
            systemPrompt,
            maxTokens,
          });

          const completionMarkdown = buildChatParticipantCompletionMarkdown({
            streamedText,
            toolCallCount,
            failedToolCount,
            completion: completionEvent,
            cancelled: token.isCancellationRequested,
          });

          if (completionMarkdown) {
            response.markdown(completionMarkdown);
          }

          return { metadata: metadata(mode, request.command) };
        }

        const systemPrompt = contextBuilder.build({
          mode,
          providerType,
          model: providerConfig.model,
          maxIterations: 25,
        });

        const agentLoop = agentLoopFactory.createAgentLoop(
          provider,
          systemPrompt,
          {
            maxTokens: providerConfig.maxTokens,
          },
        );
        const orchestrator = new ThinkingOrchestrator({
          agentLoop,
          eventEmitter: this.eventEmitter,
          logger: this.logger,
          evidenceProvider: (evidenceRequest) =>
            buildEvidencePack(evidenceRequest, this.contextEngine),
          workspaceEvidenceCollector: (evidenceRequest) =>
            new WorkspaceEvidenceCollector(this.toolRegistry).collect(
              evidenceRequest,
            ),
        });

        this.stateManager.prepareInteraction(executionContext);
        this.stateManager.startExecution();

        const generator = orchestrator.run({
          initialMessage: effectivePrompt,
          context: executionContext,
          previousMessages: compiledInteraction.previousMessages,
        });

        for await (const event of generator) {
          if (token.isCancellationRequested) {
            break;
          }

          this.eventEmitter.emitEvent(event);
        }

        const completionMarkdown = buildChatParticipantCompletionMarkdown({
          streamedText,
          toolCallCount,
          failedToolCount,
          completion: completionEvent,
          cancelled: token.isCancellationRequested,
        });

        if (completionMarkdown) {
          response.markdown(completionMarkdown);
        }

        return { metadata: metadata(mode, request.command) };
      } finally {
        await provider.dispose();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Korix chat error.";
      this.logger.error("Korix chat participant failed", error);
      response.markdown(`Korix não conseguiu concluir a solicitação: ${message}`);
      return {
        errorDetails: { message },
        metadata: metadata(mode, request.command),
      };
    } finally {
      subscription.dispose();
      this.stateManager.stopExecution();
    }
  }

  private resolveMode(command: string | undefined): Mode {
    if (command) {
      const mapped = CHAT_COMMAND_MODES[command.toLowerCase()];
      if (mapped) {
        return mapped;
      }
    }

    return this.stateManager.getMode();
  }
}
