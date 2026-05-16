/**
 * Tool Approval Modal - Request user approval for tool execution
 * Shows tool name, input preview, and approval options
 */

import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { useVSCode } from '../../hooks/useVSCode';

interface PendingApproval {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export default function ToolApprovalModal() {
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const vscode = useVSCode();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'runtime_event') {
        const runtimeEvent = message.payload.event;

        if (runtimeEvent.type === 'tool_approval_required') {
          setPendingApproval({
            id: runtimeEvent.id,
            name: runtimeEvent.name,
            input: runtimeEvent.input,
          });
        }

        // Clear modal when tool is approved or denied
        if (
          runtimeEvent.type === 'tool_approved' ||
          runtimeEvent.type === 'tool_denied'
        ) {
          setPendingApproval(null);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleApprove = (approval: 'once' | 'always') => {
    if (!pendingApproval) return;

    vscode.postMessage({
      type: 'approve_tool',
      payload: {
        toolCallId: pendingApproval.id,
        approval,
      },
    });

    setPendingApproval(null);
  };

  const handleReject = () => {
    if (!pendingApproval) return;

    vscode.postMessage({
      type: 'approve_tool',
      payload: {
        toolCallId: pendingApproval.id,
        approval: 'reject',
      },
    });

    setPendingApproval(null);
  };

  const formatInput = (input: unknown): string => {
    if (typeof input === 'string') {
      return input;
    }
    return JSON.stringify(input, null, 2);
  };

  return (
    <Modal
      isOpen={pendingApproval !== null}
      onClose={handleReject}
      title="Tool Approval Required"
    >
      {pendingApproval && (
        <div className="space-y-4">
          {/* Tool Info */}
          <div>
            <h3 className="text-sm font-medium text-[var(--vscode-foreground)] mb-2">
              Tool: {pendingApproval.name}
            </h3>
            <p className="text-xs text-[var(--vscode-descriptionForeground)]">
              Korix precisa da sua aprovação para executar esta ferramenta.
            </p>
          </div>

          {/* Input Preview */}
          <div>
            <h4 className="text-xs font-medium text-[var(--vscode-foreground)] mb-2">
              Input:
            </h4>
            <pre className="text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] rounded p-3 overflow-x-auto max-h-60 overflow-y-auto">
              {formatInput(pendingApproval.input)}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end pt-2">
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded"
            >
              Reject
            </button>
            <button
              onClick={() => handleApprove('always')}
              className="px-4 py-2 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
            >
              Always Allow
            </button>
            <button
              onClick={() => handleApprove('once')}
              className="px-4 py-2 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
            >
              Approve Once
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
