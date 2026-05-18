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

  // Restore sidebar width from localStorage (mínimo 450px)
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('korix-sidebar-width');
      const sidebar = document.querySelector('.sidebar') as HTMLElement;

      if (!sidebar) {
        console.warn('[Sidebar] Sidebar element not found');
        return;
      }

      if (savedWidth) {
        const parsedWidth = parseInt(savedWidth, 10);

        if (isNaN(parsedWidth)) {
          console.warn('[Sidebar] Invalid saved width:', savedWidth);
          return;
        }

        const width = Math.max(450, parsedWidth);
        sidebar.style.width = `${width}px`;

        // Update localStorage if we enforced minimum
        if (width !== parsedWidth) {
          localStorage.setItem('korix-sidebar-width', width.toString());
        }
      }
    } catch (error) {
      console.error('[Sidebar] Error restoring width:', error);
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
