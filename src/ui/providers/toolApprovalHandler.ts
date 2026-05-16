/**
 * ToolApprovalHandler - Handles tool approval decisions from webview
 */

import type { Logger } from '../../telemetry/logger';
import type { PermissionManager } from '../../harness/permissions';

export class ToolApprovalHandler {
  constructor(
    private readonly logger: Logger,
    private readonly permissionManager: PermissionManager,
  ) {}

  /**
   * User approves/rejects a tool call
   * NOTE: Currently ExecutionEngine uses vscode.window.showWarningMessage for approvals.
   * This handler is prepared for future webview-based approval UI integration.
   */
  async handleApproveTool(
    toolCallId: string,
    approval: 'once' | 'always' | 'reject',
  ): Promise<void> {
    this.logger.info('Tool approval decision', { toolCallId, approval });

    // Extract tool name from toolCallId
    // Expected format: "toolName_timestamp" (e.g., "ReadFile_1234567890")
    // Falls back to full toolCallId if no underscore present
    const toolName = toolCallId.split('_')[0] ?? toolCallId;

    if (approval === 'always') {
      // Add permanent approval rule
      this.permissionManager.addRule({
        tool: toolName,
        level: 'always',
      });
      this.logger.info('Added permanent approval rule', { tool: toolName });
    } else if (approval === 'reject') {
      // For now, just log rejection
      // Future: signal ExecutionEngine to cancel pending tool call
      this.logger.warn('Tool call rejected by user', { toolCallId });
    }

    // TODO: Integrate with ExecutionEngine approval flow
    // Current ExecutionEngine uses synchronous vscode.window.showWarningMessage
    // Future: make ExecutionEngine wait for webview approval via event
  }
}
