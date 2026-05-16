/**
 * Checkpoint List - Shows available checkpoints with restore functionality
 * Displays checkpoint metadata and provides restore button
 */

import React, { useState, useEffect } from 'react';
import { useVSCode } from '../../hooks/useVSCode';

interface Checkpoint {
  readonly checkpointId: string;
  readonly iteration: number;
  readonly filesChanged: number;
  readonly timestamp: number;
}

export default function CheckpointList() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const vscode = useVSCode();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'runtime_event') {
        const runtimeEvent = message.payload.event;

        if (runtimeEvent.type === 'checkpoint_created') {
          setCheckpoints((prev) => [
            ...prev,
            {
              checkpointId: runtimeEvent.checkpointId,
              iteration: runtimeEvent.iteration,
              filesChanged: runtimeEvent.filesChanged,
              timestamp: runtimeEvent.timestamp,
            },
          ]);
        }

        // Clear checkpoints when execution completes
        if (runtimeEvent.type === 'execution_complete') {
          setCheckpoints([]);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRestore = (checkpointId: string) => {
    vscode.postMessage({
      type: 'restore_checkpoint',
      payload: { checkpointId },
    });
  };

  if (checkpoints.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--vscode-descriptionForeground)] text-sm">
        No checkpoints available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
        {checkpoints.length} checkpoint{checkpoints.length === 1 ? '' : 's'} available
      </div>

      {checkpoints.map((checkpoint, index) => (
        <div
          key={checkpoint.checkpointId}
          className="border border-[var(--vscode-panel-border)] rounded p-3 bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-[var(--vscode-foreground)]">
                  Checkpoint #{checkpoints.length - index}
                </span>
                <span className="text-xs px-2 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
                  Iteration {checkpoint.iteration}
                </span>
              </div>

              <div className="text-xs text-[var(--vscode-descriptionForeground)] space-y-1">
                <div>Files changed: {checkpoint.filesChanged}</div>
                <div>Created: {formatTimestamp(checkpoint.timestamp)}</div>
                <div className="font-mono opacity-60 truncate">
                  ID: {checkpoint.checkpointId.substring(0, 8)}...
                </div>
              </div>
            </div>

            <button
              onClick={() => handleRestore(checkpoint.checkpointId)}
              className="px-3 py-1.5 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
            >
              Restore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}
