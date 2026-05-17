/**
 * TabBar - Multiple session tabs (Chrome/VSCode style)
 */

import React from 'react';
import TabItem from './TabItem';
import { useStore } from '../../store';

interface TabBarProps {
  readonly onMenuClick: () => void;
}

export default function TabBar({ onMenuClick }: TabBarProps) {
  // Use selectors separados para evitar re-renders desnecessários
  const conversations = useStore((state) => state.conversations);
  const activeChatId = useStore((state) => state.activeChatId);
  const createChat = useStore((state) => state.createChat);
  const switchChat = useStore((state) => state.switchChat);
  const closeChat = useStore((state) => state.closeChat);

  const conversationsList = Object.values(conversations);

  return (
    <div className="flex-shrink-0 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <div className="flex items-stretch h-9">
        {/* Tabs Container - Scrollable */}
        <div className="flex items-stretch flex-1 overflow-x-auto min-w-0">
          {/* Dynamic Tabs */}
          {conversationsList.map((conv) => (
            <TabItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeChatId}
              onSelect={() => switchChat(conv.id)}
              onClose={() => closeChat(conv.id)}
            />
          ))}

          {/* New Tab Button */}
          <button
            onClick={() => createChat()}
            className="px-2 flex-shrink-0 opacity-50 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
            title="New session"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>

        {/* Actions - Fixed à direita */}
        <div className="flex items-stretch flex-shrink-0 border-l border-[var(--vscode-panel-border)]">
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
    </div>
  );
}
