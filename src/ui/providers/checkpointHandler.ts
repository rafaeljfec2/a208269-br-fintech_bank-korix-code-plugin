/**
 * CheckpointHandler - Handles checkpoint restore operations
 */

import * as vscode from 'vscode';
import type { Logger } from '../../telemetry/logger';
import type { CheckpointManager } from '../../core/runtime/checkpoints';
import type { ExtensionToWebviewMessage } from '../../shared/protocol';

export class CheckpointHandler {
  constructor(
    private readonly webview: vscode.Webview,
    private readonly logger: Logger,
    private readonly checkpointManager: CheckpointManager,
  ) {}

  /**
   * User restores a checkpoint
   */
  async handleRestoreCheckpoint(checkpointId: string): Promise<void> {
    this.logger.info('Checkpoint restore requested', { checkpointId });

    try {
      // Verify checkpoint exists
      const checkpoint = this.checkpointManager.get(checkpointId);
      if (!checkpoint) {
        vscode.window.showErrorMessage(`Checkpoint ${checkpointId} not found`);
        return;
      }

      // Confirm with user (destructive operation)
      const confirm = await vscode.window.showWarningMessage(
        `Restore checkpoint from iteration ${checkpoint.iteration}?`,
        {
          modal: true,
          detail: `This will revert ${checkpoint.modifiedFiles.length} file(s) to their state at ${new Date(checkpoint.timestamp).toLocaleString()}. Current changes will be lost.`,
        },
        'Restore',
        'Cancel',
      );

      if (confirm !== 'Restore') {
        this.logger.info('Checkpoint restore cancelled by user');
        return;
      }

      // Restore files from checkpoint
      await this.checkpointManager.restore(checkpointId);

      // Notify webview of successful restore
      const message: ExtensionToWebviewMessage = {
        type: 'runtime_event',
        payload: {
          event: {
            type: 'checkpoint_restored',
            checkpointId,
            iteration: checkpoint.iteration,
            timestamp: Date.now(),
          },
        },
      };

      await this.webview.postMessage(message);

      vscode.window.showInformationMessage(
        `Checkpoint restored: ${checkpoint.modifiedFiles.length} file(s) reverted`,
      );
      this.logger.info('Checkpoint restored successfully', { checkpointId });
    } catch (error) {
      this.logger.error('Checkpoint restore failed', error);
      vscode.window.showErrorMessage(
        `Failed to restore checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
