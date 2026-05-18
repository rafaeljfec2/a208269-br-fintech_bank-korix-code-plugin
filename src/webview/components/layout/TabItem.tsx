/**
 * TabItem - Individual tab for conversation sessions
 */

import React from 'react';
import type { ChatSession } from '../../store/slices/chatSlice';

interface TabItemProps {
  readonly conversation: ChatSession;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}

export default function TabItem({ conversation, isActive, onSelect, onClose }: TabItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 h-7 border-r border-[var(--vscode-panel-border)] cursor-pointer flex-shrink-0 min-w-[120px] max-w-[200px]
                ${
                  isActive
                    ? 'border-b-2 border-[var(--vscode-button-background)] bg-[var(--vscode-editor-background)]'
                    : 'hover:bg-[var(--vscode-list-hoverBackground)] opacity-60'
                }`}
    >
      <span className="text-sm truncate max-w-[150px]">{conversation.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-50 hover:opacity-100 p-0.5"
        title="Close tab"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
        </svg>
      </button>
    </div>
  );
}
