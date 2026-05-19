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
  const icon =
    type === 'completed'
      ? String.fromCharCode(0x2713)
      : type === 'plan_created'
      ? String.fromCodePoint(0x1f4cb)
      : String.fromCharCode(0x2717);

  const containerClass = clsx(
    'flex items-center gap-1 border-l-2 pl-2 mt-1',
    type === 'completed' && 'border-[var(--vscode-terminal-ansiGreen)]',
    type === 'plan_created' && 'border-[var(--vscode-descriptionForeground)]',
    type === 'error' && 'border-[var(--vscode-terminal-ansiRed)]'
  );

  const textColor = clsx(
    'text-[10px] opacity-50',
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
    <div className={containerClass}>
      <span aria-hidden="true" className={textColor}>{icon}</span>
      <span className={textColor}>{title}</span>
      {subtitle && <span className={textColor}>{subtitle}</span>}
      {action && (
        <button type="button" className={actionButton} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
