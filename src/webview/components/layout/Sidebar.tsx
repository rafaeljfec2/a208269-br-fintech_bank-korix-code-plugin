/**
 * Sidebar - Lista de sessões de chat
 */

import React, { useEffect } from 'react';
import { useStore } from '../../store';
import SessionList from './SessionList';

export default function Sidebar() {
  const conversations = useStore((state) => state.conversations);
  const activeChatId = useStore((state) => state.activeChatId);
  const switchChat = useStore((state) => state.switchChat);
  const closeChat = useStore((state) => state.closeChat);

  // Convert conversations object to sorted array (most recent first)
  const sessions = Object.values(conversations).sort((a, b) => b.createdAt - a.createdAt);

  // Restore sidebar width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('korix-sidebar-width');
    if (savedWidth) {
      const sidebar = document.querySelector('.sidebar') as HTMLElement;
      if (sidebar) {
        sidebar.style.width = `${savedWidth}px`;
      }
    }
  }, []);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Sessions</h3>
      </div>

      <SessionList
        sessions={sessions}
        activeSessionId={activeChatId}
        onSelectSession={switchChat}
        onDeleteSession={closeChat}
      />
    </div>
  );
}
