/**
 * ToolExecutionItem - Timeline item for a single tool execution
 */

import React from 'react';
import { clsx } from 'clsx';

export interface ToolExecution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'success' | 'error' | 'pending';
  readonly duration: number; // ms
  readonly timestamp: number;
}

interface ToolExecutionItemProps {
  readonly tool: ToolExecution;
}

export default function ToolExecutionItem({ tool }: ToolExecutionItemProps) {
  // Format duration (ms → seconds)
  const formatDuration = (ms: number): string => {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  // Classes
  const timelineItem = clsx(
    'flex items-center gap-3 px-3 py-2 rounded',
    'hover:bg-[var(--vscode-list-hoverBackground)] transition-colors'
  );

  const statusIcon = clsx(
    'w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0',
    tool.status === 'success' && 'bg-[var(--vscode-terminal-ansiGreen)] text-white',
    tool.status === 'error' && 'bg-[var(--vscode-terminal-ansiRed)] text-white',
    tool.status === 'pending' && 'bg-[var(--vscode-terminal-ansiYellow)] text-black'
  );

  const toolBadge = clsx(
    'px-2 py-0.5 text-xs font-medium rounded',
    'bg-[var(--vscode-button-background)]',
    'text-[var(--vscode-button-foreground)]'
  );

  const duration = 'text-xs opacity-50 ml-auto tabular-nums';

  return (
    <div className={timelineItem}>
      {/* Status Icon */}
      <div className={statusIcon}>
        {tool.status === 'success' && '✓'}
        {tool.status === 'error' && '✗'}
        {tool.status === 'pending' && '⏳'}
      </div>

      {/* Description */}
      <div className="flex-1 text-sm">{tool.description}</div>

      {/* Tool Badge */}
      <div className={toolBadge}>{tool.name}</div>

      {/* Duration */}
      {tool.duration > 0 && <div className={duration}>{formatDuration(tool.duration)}</div>}
    </div>
  );
}
