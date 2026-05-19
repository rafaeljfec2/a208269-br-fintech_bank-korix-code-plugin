/**
 * ExecutionFeedback - Real-time activity indicator
 * Shows what the LLM/runtime is doing RIGHT NOW
 */

import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

export default function ExecutionFeedback() {
  // FIX: Correct property name is 'items' not 'timelineEvents'
  const timelineItems = useStore((state) => state.items);
  const isExecuting = useStore((state) => state.isExecuting);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer for elapsed time - MUST be before early return (React hooks rule)
  useEffect(() => {
    if (!isExecuting) {
      setElapsedSeconds(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  // Early return AFTER all hooks (React rules)
  if (!isExecuting) return null;

  // Get the most recent events (last 10)
  // FIX: Guard against undefined to prevent .slice() error
  const recentEvents = (timelineItems ?? []).slice(-10).reverse();

  // Find active events (pending)
  const activeEvents = recentEvents.filter((e) => e.status === 'pending');

  // Get the most recent active event
  const primaryEvent = activeEvents[0];

  // Count by type for summary
  const toolCount = activeEvents.filter((e) => e.type === 'tool').length;
  const thinkingActive = activeEvents.some((e) => e.type === 'thinking');

  // Build status message
  let statusMessage = 'Processando...';
  let icon = '⚙️';

  if (primaryEvent) {
    icon = getIconForEventType(primaryEvent.type);
    statusMessage = primaryEvent.description;

    // Add metadata if tool
    if (primaryEvent.type === 'tool' && primaryEvent.metadata?.toolName) {
      statusMessage = `${primaryEvent.metadata.toolName}`;
    }
  }

  // Build summary
  const summary: string[] = [];
  if (thinkingActive) summary.push('🧠 Pensando');
  if (toolCount > 0) summary.push(`🔧 ${toolCount} tool${toolCount > 1 ? 's' : ''}`);

  return (
    <div className="px-3 py-2 bg-[var(--vscode-input-background)]/30 rounded border-l-2 border-[var(--vscode-charts-blue)] mb-3">
      {/* Primary status */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 text-xs text-[var(--vscode-foreground)]">
          <span className="animate-pulse">{icon}</span>
          <span className="font-medium">{statusMessage}</span>
        </div>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] tabular-nums">
          {elapsedSeconds}s
        </span>
      </div>

      {/* Summary of active operations */}
      {summary.length > 0 && (
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-70">
          {summary.join(' • ')}
        </div>
      )}
    </div>
  );
}

function getIconForEventType(type: string): string {
  switch (type) {
    case 'tool':
      return '🔧';
    case 'thinking':
      return '🧠';
    case 'iteration':
      return '🔄';
    case 'checkpoint':
      return '💾';
    case 'error':
      return '⚠️';
    default:
      return '⚙️';
  }
}
