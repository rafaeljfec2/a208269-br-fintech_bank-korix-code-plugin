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
  const textColor = clsx(
    'text-[10px] opacity-50 mt-1',
    type === 'completed' && 'text-[var(--vscode-terminal-ansiGreen)]',
    type === 'plan_created' && 'text-[var(--vscode-descriptionForeground)]',
    type === 'error' && 'text-[var(--vscode-terminal-ansiRed)]'
  );

  const actionButton = clsx(
    'ml-2 px-2 py-0.5 text-[10px] rounded',
    'bg-[var(--vscode-button-background)]',
    'text-[var(--vscode-button-foreground)]',
    'hover:bg-[var(--vscode-button-hoverBackground)]',
    'transition-colors cursor-pointer'
  );

  return (
    <div className="flex items-center gap-1">
      <span className={textColor}>
        {title}
        {subtitle && ` ${subtitle}`}
      </span>
      {action && (
        <button type="button" className={actionButton} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
