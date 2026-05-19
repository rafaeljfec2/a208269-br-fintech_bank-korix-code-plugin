/**
 * StatusCard - Status card for plan created, completed, etc.
 */

import React from 'react';
import { clsx } from 'clsx';

interface StatusCardProps {
  readonly type: 'plan_created' | 'completed' | 'error';
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

export default function StatusCard({ type, title, subtitle, action }: StatusCardProps) {
  const statusCard = clsx(
    'flex items-center gap-2 px-3 py-1.5 rounded border mt-2',
    type === 'completed' &&
      'border-[var(--vscode-terminal-ansiGreen)] bg-[var(--vscode-terminal-ansiGreen)]/10',
    type === 'plan_created' &&
      'border-[var(--vscode-button-background)] bg-[var(--vscode-button-background)]/10',
    type === 'error' &&
      'border-[var(--vscode-terminal-ansiRed)] bg-[var(--vscode-terminal-ansiRed)]/10'
  );

  const statusIcon = clsx(
    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
    type === 'completed' && 'bg-[var(--vscode-terminal-ansiGreen)] text-white',
    type === 'plan_created' && 'bg-[var(--vscode-button-background)] text-white',
    type === 'error' && 'bg-[var(--vscode-terminal-ansiRed)] text-white'
  );

  const actionButton = clsx(
    'px-3 py-1.5 text-xs rounded',
    'bg-[var(--vscode-button-background)]',
    'text-[var(--vscode-button-foreground)]',
    'hover:bg-[var(--vscode-button-hoverBackground)]',
    'transition-colors cursor-pointer'
  );

  return (
    <div className={statusCard}>
      {/* Icon */}
      <div className={statusIcon}>
        {type === 'completed' && '✓'}
        {type === 'plan_created' && '📋'}
        {type === 'error' && '✗'}
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="font-medium text-xs">{title}</div>
        {subtitle && <div className="text-[10px] opacity-60">{subtitle}</div>}
      </div>

      {/* Action Button */}
      {action && (
        <button type="button" className={actionButton} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
