/**
 * MessageHandler - Bridge between Runtime and Webview
 * Forwards RuntimeEventEmitter events to webview via postMessage
 * Handles incoming webview messages and routes to commands
 */

import * as vscode from "vscode";
import type { RuntimeEventEmitter } from "../../core/runtime/runtimeEvents";
import type { TerminalSessionManager } from "../../terminal/session";
import type { Container } from "../../di/container";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  InitPayload,
  SaveSettingsPayload,
  TestConnectionPayload,
} from "../../shared/protocol";
import { TOKENS } from "../../di/tokens";
import type { Logger } from "../../telemetry/logger";
import { TerminalBridge } from "./terminalBridge";
import type { RuntimeStateManager } from "../../core/runtime/runtimeStateManager";
import type { ProviderConfigManager } from "../../providers/config";
import type { CheckpointManager } from "../../core/runtime/checkpoints";
import type { PermissionManager } from "../../harness/permissions";
import { AgentLoopFactory } from "./agentLoopFactory";
import { ToolApprovalHandler } from "./toolApprovalHandler";
import { CheckpointHandler } from "./checkpointHandler";
import type { ToolRegistry } from "../../harness/toolRegistry";
import { AgentExecutor } from "./agentExecutor";
import { SettingsHandler } from "./settingsHandler";
import { ConnectionTester } from "./connectionTester";

export class MessageHandler {
  private readonly logger: Logger;
  private readonly eventEmitter: RuntimeEventEmitter;
  private readonly terminalBridge: TerminalBridge;
  private readonly stateManager: RuntimeStateManager;
  private readonly configManager: ProviderConfigManager;
  private readonly checkpointManager: CheckpointManager;
  private readonly permissionManager: PermissionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly agentLoopFactory: AgentLoopFactory;
  private readonly toolApprovalHandler: ToolApprovalHandler;
  private readonly checkpointHandler: CheckpointHandler;
  private readonly agentExecutor: AgentExecutor;
  private readonly settingsHandler: SettingsHandler;
  private readonly connectionTester: ConnectionTester;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    container: Container,
  ) {
    this.logger = container.get<Logger>(TOKENS.Logger);
    this.eventEmitter = container.get<RuntimeEventEmitter>(
      TOKENS.RuntimeEventEmitter,
    );
    this.stateManager = container.get<RuntimeStateManager>(
      TOKENS.RuntimeStateManager,
    );
    this.configManager = container.get<ProviderConfigManager>(
      TOKENS.ProviderConfigManager,
    );
    this.checkpointManager = container.get<CheckpointManager>(
      TOKENS.CheckpointManager,
    );
    this.permissionManager = container.get<PermissionManager>(
      TOKENS.PermissionManager,
    );
    this.toolRegistry = container.get<ToolRegistry>(TOKENS.ToolRegistry);

    const terminalManager = container.get<TerminalSessionManager>(
      TOKENS.SessionManager,
    );
    this.terminalBridge = new TerminalBridge(
      webview,
      terminalManager,
      this.logger,
    );

    // Initialize specialized handlers
    this.agentLoopFactory = new AgentLoopFactory(
      container,
      this.logger,
      this.eventEmitter,
      this.checkpointManager,
      this.permissionManager,
    );
    this.toolApprovalHandler = new ToolApprovalHandler(
      this.logger,
      this.permissionManager,
    );
    this.checkpointHandler = new CheckpointHandler(
      webview,
      this.logger,
      this.checkpointManager,
    );

    // Initialize extraction handlers
    this.agentExecutor = new AgentExecutor(
      this.logger,
      this.stateManager,
      this.configManager,
      this.agentLoopFactory,
      this.toolRegistry,
    );
    this.settingsHandler = new SettingsHandler(
      webview,
      this.logger,
      this.configManager,
    );
    this.connectionTester = new ConnectionTester(
      webview,
      this.logger,
      this.stateManager,
      this.agentLoopFactory,
    );

    this.setupEventForwarding();
  }

  /**
   * Setup forwarding of RuntimeEventEmitter events to webview
   */
  private setupEventForwarding(): void {
    const subscription = this.eventEmitter.onEvent((event) => {
      const message: ExtensionToWebviewMessage = {
        type: "runtime_event",
        payload: { event },
      };

      this.webview.postMessage(message).then(
        () => {
          // Success - event forwarded
        },
        (error) => {
          this.logger.error(
            "Failed to forward runtime event to webview",
            error,
          );
        },
      );
    });

    this._disposables.push(subscription);
    this.logger.info("Event forwarding setup complete");
  }

  /**
   * Send initial state to webview on load
   */
  public async sendInitialState(): Promise<void> {
    const mode = this.stateManager.isInitialized()
      ? this.stateManager.getMode()
      : "ask";

    const sessionId = this.stateManager.getSessionId() ?? crypto.randomUUID();

    const isExecuting = this.stateManager.isExecuting();

    const providerType = vscode.workspace
      .getConfiguration("korix")
      .get<
        "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
      >("provider", "anthropic");

    const config = await this.configManager.getConfig(providerType);
    const model = config?.model ?? "claude-sonnet-4-6";

    const initPayload: InitPayload = {
      mode,
      model,
      sessionId,
      isExecuting,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };

    const message: ExtensionToWebviewMessage = {
      type: "init",
      payload: initPayload,
    };

    this.webview.postMessage(message).then(
      () => {
        this.logger.info("Initial state sent to webview", {
          mode,
          model,
          sessionId,
          isExecuting,
        });
      },
      (error) => {
        this.logger.error("Failed to send initial state to webview", error);
      },
    );
  }

  /**
   * Handle incoming messages from webview
   */
  public async handleMessage(
    message: WebviewToExtensionMessage,
  ): Promise<void> {
    this.logger.debug("Received message from webview", { type: message.type });

    switch (message.type) {
      case "send_message":
        await this.handleSendMessage(
          message.payload.content,
          message.payload.messages ?? [],
        );
        break;

      case "change_mode":
        this.handleChangeMode(message.payload.mode);
        break;

      case "approve_tool":
        this.handleApproveTool(
          message.payload.toolCallId,
          message.payload.approval,
        );
        break;

      case "terminal_input":
        this.handleTerminalInput(
          message.payload.sessionId,
          message.payload.data,
        );
        break;

      case "create_terminal":
        this.handleCreateTerminal(message.payload.shellPath);
        break;

      case "restore_checkpoint":
        await this.handleRestoreCheckpoint(message.payload.checkpointId);
        break;

      case "load_settings":
        await this.handleLoadSettings();
        break;

      case "save_settings":
        await this.handleSaveSettings(message.payload);
        break;

      case "test_connection":
        await this.handleTestConnection(message.payload);
        break;

      case "answer_question":
        this.handleAnswerQuestion(
          message.payload.questionId,
          message.payload.answers,
        );
        break;

      default:
        this.logger.warn("Unknown message type from webview", { message });
    }
  }

  /**
   * User sends a message (execute agent loop)
   */
  private async handleSendMessage(
    content: string,
    previousMessages: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
  ): Promise<void> {
    await this.agentExecutor.execute(content, previousMessages);
  }

  /**
   * User switches mode (Ask/Plan/Agent)
   */
  private handleChangeMode(mode: "ask" | "plan" | "agent"): void {
    this.logger.info("Mode change requested", { mode });

    // Update mode in RuntimeStateManager
    this.stateManager.setMode(mode);

    // Notify webview of mode change via event
    const message: ExtensionToWebviewMessage = {
      type: "mode_changed",
      payload: { mode },
    };

    void this.webview.postMessage(message);
    this.logger.info("Mode changed successfully", { mode });
  }

  /**
   * User approves/rejects a tool call
   */
  private handleApproveTool(
    toolCallId: string,
    approval: "once" | "always" | "reject",
  ): void {
    this.toolApprovalHandler.handleApproveTool(toolCallId, approval);
  }

  /**
   * User types in terminal
   */
  private handleTerminalInput(sessionId: string, data: string): void {
    this.terminalBridge.write(sessionId, data);
  }

  /**
   * User creates a new terminal
   */
  private handleCreateTerminal(shellPath?: string): void {
    this.terminalBridge.createSession(shellPath);
  }

  /**
   * User restores a checkpoint
   */
  private async handleRestoreCheckpoint(checkpointId: string): Promise<void> {
    await this.checkpointHandler.handleRestoreCheckpoint(checkpointId);
  }

  /**
   * Load current settings and send to webview
   */
  private async handleLoadSettings(): Promise<void> {
    await this.settingsHandler.loadSettings();
  }

  /**
   * Save settings to workspace config and secrets
   */
  private async handleSaveSettings(
    payload: SaveSettingsPayload,
  ): Promise<void> {
    await this.settingsHandler.saveSettings(payload);
  }

  /**
   * Test connection to provider
   */
  private async handleTestConnection(
    payload: TestConnectionPayload,
  ): Promise<void> {
    await this.connectionTester.testConnection(payload);
  }

  /**
   * User answers a question
   */
  private handleAnswerQuestion(
    questionId: string,
    answers: string[],
  ): void {
    this.logger.info("User answered question", { questionId, answers });

    // Emit user_answer event
    this.eventEmitter.emitEvent({
      type: "user_answer",
      questionId,
      answers,
      isTimeout: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
    this.logger.info("MessageHandler disposed");
  }
}
