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

export class MessageHandler {
  private readonly logger: Logger;
  private readonly eventEmitter: RuntimeEventEmitter;
  private readonly terminalManager: TerminalSessionManager;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly container: Container,
  ) {
    this.logger = container.get<Logger>(TOKENS.Logger);
    this.eventEmitter = container.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    this.terminalManager = container.get<TerminalSessionManager>(TOKENS.SessionManager);

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
  public sendInitialState(): void {
    const initPayload: InitPayload = {
      mode: 'ask', // TODO: Get from runtime state
      model: 'claude-sonnet-4-6', // TODO: Get from config
      sessionId: crypto.randomUUID(), // TODO: Get from session manager
      isExecuting: false, // TODO: Get from runtime state
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };

    const message: ExtensionToWebviewMessage = {
      type: 'init',
      payload: initPayload,
    };

    this.webview.postMessage(message).then(
      () => {
        this.logger.info('Initial state sent to webview');
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
  private handleSendMessage(content: string): void {
    this.logger.info('User message received', { length: content.length });
    // TODO: Trigger agent loop with message
    vscode.window.showInformationMessage(`Message: ${content.substring(0, 50)}...`);
  }

  /**
   * User switches mode (Ask/Plan/Agent)
   */
  private handleChangeMode(mode: 'ask' | 'plan' | 'agent'): void {
    this.logger.info('Mode change requested', { mode });
    // TODO: Update runtime state mode
    vscode.window.showInformationMessage(`Mode changed to: ${mode}`);
  }

  /**
   * User approves/rejects a tool call
   */
  private handleApproveTool(
    toolCallId: string,
    approval: 'once' | 'always' | 'reject',
  ): void {
    this.logger.info('Tool approval decision', { toolCallId, approval });

    if (approval === 'reject') {
      // TODO: Cancel execution with rejection
      vscode.window.showInformationMessage(`Tool ${toolCallId} rejected`);
    } else {
      // TODO: Resume execution with approval
      const msg = approval === 'always' ? ' (remembered)' : '';
      vscode.window.showInformationMessage(`Tool ${toolCallId} approved${msg}`);
    }
  }

  /**
   * User types in terminal
   */
  private async handleTerminalInput(sessionId: string, data: string): Promise<void> {
    const session = this.terminalManager.getSession(sessionId);
    if (!session) {
      this.logger.error('Terminal session not found', { sessionId });
      return;
    }

    session.pty.write(data);
  }

  /**
   * User creates a new terminal
   */
  private async handleCreateTerminal(shellPath?: string): Promise<void> {
    this.logger.info('Creating terminal session', { shellPath });

    const sessionId = this.terminalManager.createSession({
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      env: process.env as Record<string, string>,
    });

    const session = this.terminalManager.getSession(sessionId);
    if (!session) {
      this.logger.error('Failed to retrieve created terminal session', { sessionId });
      return;
    }

    // Setup PTY output forwarding
    session.pty.onData((data: string) => {
      const message: ExtensionToWebviewMessage = {
        type: 'terminal_output',
        payload: {
          sessionId,
          data,
        },
      };

      this.webview.postMessage(message).then(
        () => {
          // Success
        },
        (error) => {
          this.logger.error('Failed to forward terminal output', error);
        },
      );
    });

    // Notify webview of new session
    const sessionCreatedMsg: ExtensionToWebviewMessage = {
      type: 'terminal_session_created',
      payload: {
        sessionId,
        shellPath: shellPath ?? 'default',
      },
    };
    await this.webview.postMessage(sessionCreatedMsg);

    this.logger.info('Terminal session created', { sessionId });
  }

  /**
   * User restores a checkpoint
   */
  private async handleRestoreCheckpoint(checkpointId: string): Promise<void> {
    this.logger.info('Checkpoint restore requested', { checkpointId });
    // TODO: Trigger checkpoint restore
    vscode.window.showInformationMessage(`Restoring checkpoint: ${checkpointId}`);
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.logger.info('MessageHandler disposed');
  }
}
