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
import { PluginContextBuilder } from "../../prompts/pluginContext";
import type { ToolRegistry } from "../../harness/toolRegistry";

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
    this.logger.info("User message received", {
      length: content.length,
      historyLength: previousMessages.length,
      lastHistoryRole: previousMessages[previousMessages.length - 1]?.role,
    });

    try {
      // Get provider config
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      const providerConfig = await this.configManager.getConfig(providerType);
      if (!providerConfig) {
        vscode.window.showErrorMessage(
          `Provider ${providerType} not configured. Please set API key.`,
        );
        return;
      }

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(providerConfig);

      // Get mode (use default if not initialized yet)
      const mode = this.stateManager.isInitialized()
        ? this.stateManager.getMode()
        : "ask";

      // Build unified system prompt
      const contextBuilder = new PluginContextBuilder(this.toolRegistry, this.logger);

      const systemPrompt = contextBuilder.build({
        mode,
        providerType: providerType,
        model: providerConfig.model,
        maxIterations: 25,
      });

      // Create AgentLoop with system prompt
      const agentLoop = this.agentLoopFactory.createAgentLoop(
        provider,
        systemPrompt,
      );

      // Prepare execution context
      const context = {
        mode,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        openFiles: [],
      };

      // Initialize RuntimeStateManager if needed
      if (!this.stateManager.isInitialized()) {
        this.stateManager.initialize(context);
      }

      // Mark as executing
      this.stateManager.startExecution();

      // Run agent loop with history and process events
      const generator = agentLoop.run(content, context, previousMessages);

      try {
        for await (const event of generator) {
          try {
            this.logger.debug("Runtime event", { type: event.type });
            // Events are auto-forwarded via RuntimeEventEmitter subscription
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
    } catch (error) {
      this.logger.error("Failed to initialize agent loop", error);
      this.stateManager.stopExecution();
      vscode.window.showErrorMessage(
        `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    try {
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      const config = await this.configManager.getConfig(providerType);
      const maxTokens = vscode.workspace
        .getConfiguration("korix")
        .get<number>("maxTokens", 4096);
      const temperature = vscode.workspace
        .getConfiguration("korix")
        .get<number>("temperature", 0.7);

      // Check if API key exists (don't send the key itself)
      const hasApiKey = !!(await this.configManager.getApiKey(providerType));

      const message: ExtensionToWebviewMessage = {
        type: "settings_loaded",
        payload: {
          provider: providerType,
          model: config?.model ?? "claude-sonnet-4-6",
          baseUrl: config?.baseUrl,
          maxTokens,
          temperature,
          hasApiKey,
        },
      };

      void this.webview.postMessage(message);
      this.logger.info("Settings loaded and sent to webview");
    } catch (error) {
      this.logger.error("Failed to load settings", error);
    }
  }

  /**
   * Save settings to workspace config and secrets
   */
  private async handleSaveSettings(
    payload: SaveSettingsPayload,
  ): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration("korix");

      // Determinar target: Workspace se aberto, senão Global
      const configTarget = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

      // Save provider selection
      await config.update("provider", payload.provider, configTarget);

      // Save API key to secrets (if provided)
      if (payload.apiKey) {
        await this.configManager.setApiKey(payload.provider, payload.apiKey);
      }

      // Save model
      if (payload.model) {
        await config.update(
          `${payload.provider}.model`,
          payload.model,
          configTarget,
        );
      }

      // Save baseUrl (if provided)
      if (payload.baseUrl !== undefined) {
        await config.update(
          `${payload.provider}.baseUrl`,
          payload.baseUrl,
          configTarget,
        );
      }

      // Save advanced settings
      if (payload.maxTokens !== undefined) {
        await config.update("maxTokens", payload.maxTokens, configTarget);
      }

      if (payload.temperature !== undefined) {
        await config.update("temperature", payload.temperature, configTarget);
      }

      // Notify success
      const message: ExtensionToWebviewMessage = {
        type: "settings_saved",
        payload: { success: true, message: "Settings saved successfully" },
      };

      void this.webview.postMessage(message);
      this.logger.info("Settings saved successfully", {
        provider: payload.provider,
      });
    } catch (error) {
      this.logger.error("Failed to save settings", error);
      const message: ExtensionToWebviewMessage = {
        type: "settings_saved",
        payload: {
          success: false,
          message:
            error instanceof Error ? error.message : "Failed to save settings",
        },
      };
      void this.webview.postMessage(message);
    }
  }

  /**
   * Test connection to provider
   */
  private async handleTestConnection(
    payload: TestConnectionPayload,
  ): Promise<void> {
    try {
      this.logger.info("Testing connection", { provider: payload.provider });

      // Create temporary config for testing
      const tempConfig = {
        type: payload.provider as
          | "anthropic"
          | "openai"
          | "ollama"
          | "openrouter"
          | "litellm",
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        model: "test-model", // Placeholder for connection test
      };

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(tempConfig);

      // Simple test: send a minimal message
      const testPrompt = "Hi";
      let responseReceived = false;

      const input = {
        messages: [
          { role: "user" as const, content: testPrompt, timestamp: Date.now() },
        ],
      };

      const context = {
        correlationId: crypto.randomUUID(),
        sessionId: this.stateManager.getSessionId() ?? crypto.randomUUID(),
      };

      const stream = provider.send(input, context);

      // Check if we get any response
      for await (const event of stream) {
        if (event.type === "token" || event.type === "thinking") {
          responseReceived = true;
          break; // Connection successful, stop streaming
        }
      }

      const message: ExtensionToWebviewMessage = {
        type: "connection_test_result",
        payload: {
          success: responseReceived,
          message: responseReceived
            ? "Connection successful!"
            : "No response received from provider",
        },
      };

      void this.webview.postMessage(message);
      this.logger.info("Connection test completed", {
        success: responseReceived,
      });
    } catch (error) {
      this.logger.error("Connection test failed", error);
      const message: ExtensionToWebviewMessage = {
        type: "connection_test_result",
        payload: {
          success: false,
          message:
            error instanceof Error ? error.message : "Connection test failed",
        },
      };
      void this.webview.postMessage(message);
    }
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
