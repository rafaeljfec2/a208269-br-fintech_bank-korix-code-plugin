/**
 * Terminal Bridge - PTY to Webview communication
 * Manages terminal sessions and forwards PTY output to webview
 */

import * as vscode from 'vscode';
import type { TerminalSessionManager } from '../../terminal/session';
import type { Logger } from '../../telemetry/logger';
import type { ExtensionToWebviewMessage } from '../../shared/protocol';

export class TerminalBridge {
  constructor(
    private readonly webview: vscode.Webview,
    private readonly terminalManager: TerminalSessionManager,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a new terminal session and setup PTY forwarding
   */
  createSession(shellPath?: string): string {
    this.logger.info('Creating terminal session', { shellPath });

    const sessionId = this.terminalManager.createSession({
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      env: process.env as Record<string, string>,
    });

    const session = this.terminalManager.getSession(sessionId);
    if (!session) {
      this.logger.error('Failed to retrieve created terminal session', { sessionId });
      throw new Error('Failed to create terminal session');
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

    this.webview.postMessage(sessionCreatedMsg).then(
      () => {
        this.logger.info('Terminal session created', { sessionId });
      },
      (error) => {
        this.logger.error('Failed to notify webview of terminal creation', error);
      },
    );

    return sessionId;
  }

  /**
   * Write data to terminal PTY
   */
  write(sessionId: string, data: string): void {
    const session = this.terminalManager.getSession(sessionId);
    if (!session) {
      this.logger.error('Terminal session not found', { sessionId });
      return;
    }

    session.pty.write(data);
  }

  /**
   * Kill a terminal session
   */
  kill(sessionId: string): void {
    this.logger.info('Killing terminal session', { sessionId });
    this.terminalManager.killSession(sessionId);
  }

  /**
   * Get active session IDs
   */
  getActiveSessions(): string[] {
    return this.terminalManager.getActiveSessions().map((session) => session.id);
  }
}
