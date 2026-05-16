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

export class MessageHandler {
  private readonly logger: Logger;
  private readonly eventEmitter: RuntimeEventEmitter;
  private readonly terminalBridge: TerminalBridge;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly _container: Container,
  ) {
    this.logger = _container.get<Logger>(TOKENS.Logger);
    this.eventEmitter = _container.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    const terminalManager = _container.get<TerminalSessionManager>(TOKENS.SessionManager);
    this.terminalBridge = new TerminalBridge(webview, terminalManager, this.logger);

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
