/**
 * TopBar - Session tab (Claude.ai style)
 */

import React from 'react';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <div className="flex-shrink-0 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <div className="flex items-stretch h-9">
        {/* Session Tab - Real tab style */}
        <div className="flex items-center gap-2 px-4 border-b-2 border-[var(--vscode-button-background)] bg-[var(--vscode-editor-background)]">
          <span className="text-sm">Docker containerização</span>
          <button className="opacity-50 hover:opacity-100" title="Close tab">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        </div>

        {/* New Tab Button */}
        <button
          className="px-2 opacity-50 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
          title="New session"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <button
          className="px-3 opacity-50 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
          title="History"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zm0 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
            <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </button>

        <button
          onClick={onMenuClick}
          className="px-3 opacity-50 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
          title="Menu"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1" />
            <circle cx="8" cy="8" r="1" />
            <circle cx="8" cy="13" r="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
