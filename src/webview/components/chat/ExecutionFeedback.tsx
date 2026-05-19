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
  const completionStats = useStore((state) => state.completionStats);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // DEBUG: Log state changes
  useEffect(() => {
    console.log('[ExecutionFeedback] State changed:', {
      isExecuting,
      hasCompletionStats: !!completionStats,
      completionStats,
      itemsCount: timelineItems?.length ?? 0,
    });
  }, [isExecuting, completionStats, timelineItems]);

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

  // Show completion stats for 5 seconds after execution
  if (!isExecuting && completionStats) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--vscode-terminal-ansiGreen)]">
        <span>✓</span>
        <span>Korix concluído: {completionStats.iterations} iterações • {completionStats.toolCalls} ferramentas • {completionStats.tokens} tokens • {completionStats.duration.toFixed(1)}s</span>
      </div>
    );
  }

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

  // Build status message for "Korix [action]..."
  let statusMessage = 'Processando...';

  if (primaryEvent) {
    if (primaryEvent.type === 'thinking') {
      statusMessage = 'Pensando...';
    } else if (primaryEvent.type === 'tool' && primaryEvent.metadata?.toolName) {
      statusMessage = `Executando ${primaryEvent.metadata.toolName}`;
    } else {
      statusMessage = 'Digitando...';
    }
  }

  // Build summary with active tools
  const summary: string[] = [];
  if (toolCount > 0) summary.push(`${toolCount} tool${toolCount > 1 ? 's' : ''}`);
  summary.push(`${elapsedSeconds}s`);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)]">
      {/* Spinner */}
      <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>Korix {statusMessage}</span>
      {summary.length > 0 && <span className="opacity-50">• {summary.join(' • ')}</span>}
    </div>
  );
}

