/**
 * TabBar - Multiple session tabs (Chrome/VSCode style)
 */

import React from 'react';
import { clsx } from 'clsx';
import TabItem from './TabItem';
import { useStore } from '../../store';

export default function TabBar() {
  // Use selectors separados para evitar re-renders desnecessários
  const conversations = useStore((state) => state.conversations);
  const activeChatId = useStore((state) => state.activeChatId);
  const createChat = useStore((state) => state.createChat);
  const switchChat = useStore((state) => state.switchChat);
  const closeChat = useStore((state) => state.closeChat);
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const sidebarVisible = useStore((state) => state.sidebarVisible);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const activeTab = useStore((state) => state.activeTab);

  const handleSettingsClick = () => {
    // Toggle: se já está em settings, volta para chat
    if (activeTab === 'settings') {
      setActiveTab('chat');
    } else {
      setActiveTab('settings');
    }
  };

  const conversationsList = Object.values(conversations);

  return (
    <div className="flex-shrink-0 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <div className="flex items-stretch h-9">
        {/* Tabs Container - Scrollable (scrollbar oculta) */}
        <div className="flex items-stretch flex-1 overflow-x-auto min-w-0 no-scrollbar">
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
            onClick={toggleSidebar}
            className={clsx(
              'px-3 hover:bg-[var(--vscode-list-hoverBackground)]',
              sidebarVisible ? 'opacity-100' : 'opacity-50'
            )}
            title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              {sidebarVisible ? (
                // Sidebar visible icon
                <>
                  <path d="M2 2v12h12V2H2zm1 1h4v10H3V3zm5 0h5v10H8V3z" />
                </>
              ) : (
                // Sidebar hidden icon
                <>
                  <path d="M2 2v12h12V2H2zm1 1h10v10H3V3z" />
                </>
              )}
            </svg>
          </button>

          <button
            onClick={handleSettingsClick}
            className="px-3 opacity-50 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)]"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.932 1.618l.518 1.932c.187.06.367.133.54.218l1.763-.94.932 1.618-1.45 1.29c.037.196.057.398.057.604s-.02.408-.057.604l1.45 1.29-.932 1.618-1.763-.94c-.173.085-.353.158-.54.218l-.518 1.932H7.068l-.518-1.932c-.187-.06-.367-.133-.54-.218l-1.763.94-.932-1.618 1.45-1.29c-.037-.196-.057-.398-.057-.604s.02-.408.057-.604l-1.45-1.29.932-1.618 1.763.94c.173-.085.353-.158.54-.218l.518-1.932h1.864zm-.932 4.223c-.915 0-1.66.745-1.66 1.66s.745 1.66 1.66 1.66 1.66-.745 1.66-1.66-.745-1.66-1.66-1.66z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
