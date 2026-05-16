/**
 * Patch Preview - Shows applied patches in timeline
 * Displays file, operation, and line number for each patch
 */

import React from 'react';

interface PatchEvent {
  readonly id: string;
  readonly file: string;
  readonly lineNumber: number;
  readonly operation: 'insert' | 'replace' | 'delete';
  readonly timestamp: number;
  readonly status: 'success' | 'error';
  readonly error?: string;
}

interface PatchPreviewProps {
  readonly patches: PatchEvent[];
}

export default function PatchPreview({ patches }: PatchPreviewProps) {
  if (patches.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--vscode-descriptionForeground)] text-sm">
        No patches applied yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {patches.map((patch) => (
        <div
          key={patch.id}
          className="border border-[var(--vscode-panel-border)] rounded p-3 bg-[var(--vscode-input-background)]"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono ${
                  patch.status === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {patch.status === 'success' ? '✓' : '✗'}
              </span>
              <span className="text-xs font-medium text-[var(--vscode-foreground)]">
                {patch.file}
              </span>
            </div>
            <span className="text-xs px-2 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
              {getOperationLabel(patch.operation)}
            </span>
          </div>

          <div className="text-xs text-[var(--vscode-descriptionForeground)] space-y-1">
            <div>Line: {patch.lineNumber}</div>
            <div>Time: {formatTimestamp(patch.timestamp)}</div>
            {patch.error && (
              <div className="text-red-400 mt-2">Error: {patch.error}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function getOperationLabel(operation: 'insert' | 'replace' | 'delete'): string {
  const labels: Record<string, string> = {
    insert: 'Insert',
    replace: 'Replace',
    delete: 'Delete',
  };
  return labels[operation] ?? operation;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}
