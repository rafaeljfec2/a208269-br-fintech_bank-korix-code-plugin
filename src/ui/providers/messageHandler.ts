/**
 * MessageHandler - Bridge between Runtime and Webview
 * Forwards RuntimeEventEmitter events to webview via postMessage
 * Handles incoming webview messages and routes to commands
 */

import * as vscode from 'vscode';
import type { RuntimeEventEmitter } from '../../core/runtime/runtimeEvents';
import type { TerminalSessionManager } from '../../terminal/session';
import type { Container } from '../../di/container';
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  InitPayload,
} from '../../shared/protocol';
import { TOKENS } from '../../di/tokens';
import type { Logger } from '../../telemetry/logger';
import { TerminalBridge } from './terminalBridge';
import type { RuntimeStateManager } from '../../core/runtime/runtimeStateManager';
import type { ProviderConfigManager } from '../../providers/config';
import type { CheckpointManager } from '../../core/runtime/checkpoints';
import type { PermissionManager } from '../../harness/permissions';
import { AgentLoopFactory } from './agentLoopFactory';
import { ToolApprovalHandler } from './toolApprovalHandler';
import { CheckpointHandler } from './checkpointHandler';

export class MessageHandler {
  private readonly logger: Logger;
  private readonly eventEmitter: RuntimeEventEmitter;
  private readonly terminalBridge: TerminalBridge;
  private readonly stateManager: RuntimeStateManager;
  private readonly configManager: ProviderConfigManager;
  private readonly checkpointManager: CheckpointManager;
  private readonly permissionManager: PermissionManager;
  private readonly agentLoopFactory: AgentLoopFactory;
  private readonly toolApprovalHandler: ToolApprovalHandler;
  private readonly checkpointHandler: CheckpointHandler;

  constructor(
    private readonly webview: vscode.Webview,
    container: Container,
  ) {
    this.logger = container.get<Logger>(TOKENS.Logger);
    this.eventEmitter = container.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    this.stateManager = container.get<RuntimeStateManager>(TOKENS.RuntimeStateManager);
    this.configManager = container.get<ProviderConfigManager>(TOKENS.ProviderConfigManager);
    this.checkpointManager = container.get<CheckpointManager>(TOKENS.CheckpointManager);
    this.permissionManager = container.get<PermissionManager>(TOKENS.PermissionManager);

    const terminalManager = container.get<TerminalSessionManager>(TOKENS.SessionManager);
    this.terminalBridge = new TerminalBridge(webview, terminalManager, this.logger);

    // Initialize specialized handlers
    this.agentLoopFactory = new AgentLoopFactory(
      container,
      this.logger,
      this.eventEmitter,
      this.checkpointManager,
      this.permissionManager,
    );
    this.toolApprovalHandler = new ToolApprovalHandler(this.logger, this.permissionManager);
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
    this.eventEmitter.onEvent((event) => {
      const message: ExtensionToWebviewMessage = {
        type: 'runtime_event',
        payload: { event },
      };

      this.webview.postMessage(message).then(
        () => {
          // Success - event forwarded
        },
        (error) => {
          this.logger.error('Failed to forward runtime event to webview', error);
        },
      );
    });

    this.logger.info('Event forwarding setup complete');
  }

  /**
   * Send initial state to webview on load
   */
  public async sendInitialState(): Promise<void> {
    const mode = this.stateManager.isInitialized()
      ? this.stateManager.getMode()
      : 'ask';

    const sessionId = this.stateManager.getSessionId() ?? crypto.randomUUID();

    const isExecuting = this.stateManager.isExecuting();

    const providerType = vscode.workspace
      .getConfiguration('korix')
      .get<'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'litellm'>(
        'provider',
        'anthropic',
      );

    const config = await this.configManager.getConfig(providerType);
    const model = config?.model ?? 'claude-sonnet-4-6';

    const initPayload: InitPayload = {
      mode,
      model,
      sessionId,
      isExecuting,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };

    const message: ExtensionToWebviewMessage = {
      type: 'init',
      payload: initPayload,
    };

    this.webview.postMessage(message).then(
      () => {
        this.logger.info('Initial state sent to webview', {
          mode,
          model,
          sessionId,
          isExecuting,
        });
      },
      (error) => {
        this.logger.error('Failed to send initial state to webview', error);
      },
    );
  }

  /**
   * Handle incoming messages from webview
   */
  public async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    this.logger.debug('Received message from webview', { type: message.type });

    switch (message.type) {
      case 'send_message':
        await this.handleSendMessage(message.payload.content);
        break;

      case 'change_mode':
        await this.handleChangeMode(message.payload.mode);
        break;

      case 'approve_tool':
        await this.handleApproveTool(
          message.payload.toolCallId,
          message.payload.approval,
        );
        break;

      case 'terminal_input':
        await this.handleTerminalInput(
          message.payload.sessionId,
          message.payload.data,
        );
        break;

      case 'create_terminal':
        await this.handleCreateTerminal(message.payload.shellPath);
        break;

      case 'restore_checkpoint':
        await this.handleRestoreCheckpoint(message.payload.checkpointId);
        break;

      default:
        this.logger.warn('Unknown message type from webview', { message });
    }
  }

  /**
   * User sends a message (execute agent loop)
   */
  private async handleSendMessage(content: string): Promise<void> {
    this.logger.info('User message received', { length: content.length });

    try {
      // Get provider config
      const providerType = vscode.workspace
        .getConfiguration('korix')
        .get<'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'litellm'>(
          'provider',
          'anthropic',
        );

      const providerConfig = await this.configManager.getConfig(providerType);
      if (!providerConfig) {
        vscode.window.showErrorMessage(
          `Provider ${providerType} not configured. Please set API key.`,
        );
        return;
      }

      // Create provider instance
      const provider = await this.agentLoopFactory.createProvider(providerConfig);

      // Create AgentLoop
      const agentLoop = this.agentLoopFactory.createAgentLoop(provider);

      // Get mode (use default if not initialized yet)
      const mode = this.stateManager.isInitialized()
        ? this.stateManager.getMode()
        : 'ask';

      // Prepare execution context
      const context = {
        mode,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        openFiles: [],
      };

      // Initialize RuntimeStateManager if needed
      if (!this.stateManager.isInitialized()) {
        this.stateManager.initialize(context);
      }

      // Mark as executing
      this.stateManager.startExecution();

      // Run agent loop and process events
      const generator = agentLoop.run(content, context);

      try {
        for await (const event of generator) {
          try {
            this.logger.debug('Runtime event', { type: event.type });
            // Events are auto-forwarded via RuntimeEventEmitter subscription
          } catch (eventError) {
            this.logger.error('Failed to process runtime event', eventError);
            // Continue iteration - don't let event processing errors stop the loop
          }
        }

        this.logger.info('Agent loop completed successfully');
      } catch (error) {
        this.logger.error('Agent loop failed', error);
        vscode.window.showErrorMessage(
          `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.stateManager.stopExecution();
      }
    } catch (error) {
      this.logger.error('Failed to initialize agent loop', error);
      this.stateManager.stopExecution();
      vscode.window.showErrorMessage(
        `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * User switches mode (Ask/Plan/Agent)
   */
  private async handleChangeMode(mode: 'ask' | 'plan' | 'agent'): Promise<void> {
    this.logger.info('Mode change requested', { mode });

    // Update mode in RuntimeStateManager
    this.stateManager.setMode(mode);

    // Notify webview of mode change via event
    const message: ExtensionToWebviewMessage = {
      type: 'mode_changed',
      payload: { mode },
    };

    await this.webview.postMessage(message);
    this.logger.info('Mode changed successfully', { mode });
  }

  /**
   * User approves/rejects a tool call
   */
  private async handleApproveTool(
    toolCallId: string,
    approval: 'once' | 'always' | 'reject',
  ): Promise<void> {
    await this.toolApprovalHandler.handleApproveTool(toolCallId, approval);
  }

  /**
   * User types in terminal
   */
  private async handleTerminalInput(sessionId: string, data: string): Promise<void> {
    this.terminalBridge.write(sessionId, data);
  }

  /**
   * User creates a new terminal
   */
  private async handleCreateTerminal(shellPath?: string): Promise<void> {
    this.terminalBridge.createSession(shellPath);
  }

  /**
   * User restores a checkpoint
   */
  private async handleRestoreCheckpoint(checkpointId: string): Promise<void> {
    await this.checkpointHandler.handleRestoreCheckpoint(checkpointId);
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.logger.info('MessageHandler disposed');
  }
}
