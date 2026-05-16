/**
 * Runtime Inspector - Real-time execution metrics and mini timeline
 * Shows iteration, token count, tool count, and recent events
 */

import React from 'react';
import { useStore } from '../../store';

export default function RuntimeInspector() {
  const isExecuting = useStore((state) => state.isExecuting);
  const currentIteration = useStore((state) => state.currentIteration);
  const metrics = useStore((state) => state.metrics);
  const timelineItems = useStore((state) => state.items);

  const recentEvents = timelineItems.slice(-10).reverse();

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded overflow-hidden bg-[var(--vscode-input-background)]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isExecuting ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'
            }`}
          ></span>
          <span className="text-xs font-medium text-[var(--vscode-foreground)]">
            Runtime Inspector
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-3 py-3 grid grid-cols-2 gap-3">
        <MetricCard label="Iteration" value={currentIteration ?? 0} />
        <MetricCard
          label="Input Tokens"
          value={metrics.inputTokens ?? 0}
        />
        <MetricCard
          label="Output Tokens"
          value={metrics.outputTokens ?? 0}
        />
        <MetricCard label="Tool Calls" value={metrics.toolCallCount ?? 0} />
      </div>

      {/* Recent Events */}
      <div className="border-t border-[var(--vscode-panel-border)]">
        <div className="px-3 py-2 text-xs font-medium text-[var(--vscode-foreground)]">
          Recent Events
        </div>
        <div className="px-3 pb-3 space-y-1 max-h-40 overflow-y-auto">
          {recentEvents.length === 0 ? (
            <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center py-2">
              No events yet
            </div>
          ) : (
            recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded"
              >
                <span
                  className={
                    event.status === 'error' ? 'text-red-400' : 'text-green-400'
                  }
                >
                  {event.status === 'error' ? '✗' : '✓'}
                </span>
                <span className="flex-1 truncate text-[var(--vscode-foreground)]">
                  {event.description}
                </span>
                <span className="text-[var(--vscode-descriptionForeground)] opacity-60">
                  {getEventBadge(event.type)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-[var(--vscode-foreground)]">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
        {label}
      </div>
    </div>
  );
}

function getEventBadge(type: string): string {
  const badges: Record<string, string> = {
    iteration: 'Iter',
    tool: 'Tool',
    thinking: 'Think',
    checkpoint: 'Save',
    error: 'Error',
  };

  return badges[type] ?? type.substring(0, 4);
}
