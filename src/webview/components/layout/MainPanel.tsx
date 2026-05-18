/**
 * MainPanel - Active conversation chat area
 */

import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';
import ChatMessage from '../chat/ChatMessage';
import MarkdownContent from '../chat/MarkdownContent';
import SettingsPanel from '../settings/SettingsPanel';
import ActivityLog from '../activity/ActivityLog';
import RuntimeInspector from '../runtime/RuntimeInspector';
import TerminalPanel from '../terminal/TerminalPanel';

export default function MainPanel() {
  // Use selectors separados para evitar re-renders desnecessários
  const conversations = useStore((state) => state.conversations);
  const activeChatId = useStore((state) => state.activeChatId);
  const activeTab = useStore((state) => state.activeTab);

  // Refs para auto-scroll
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<HTMLDivElement>(null);

  const activeChat = activeChatId ? conversations[activeChatId] : null;

  // Auto-scroll durante streaming
  useEffect(() => {
    // Durante streaming, scroll para o elemento de streaming
    if (activeChat?.isStreaming && streamingRef.current) {
      streamingRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }

    // Após streaming terminar, scroll para o final do container
    if (!activeChat?.isStreaming && activeChat?.messages.length > 0) {
      setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [activeChat?.isStreaming, activeChat?.streamingContent, activeChat?.messages.length]);

  // Renderizar RuntimeInspector quando activeTab === 'timeline'
  if (activeTab === 'timeline') {
    return (
      <div className="flex-1 overflow-y-auto p-4 bg-[#0d0d0d]">
        <RuntimeInspector />
      </div>
    );
  }

  // Renderizar TerminalPanel quando activeTab === 'terminal'
  if (activeTab === 'terminal') {
    return <TerminalPanel />;
  }

  // Renderizar SettingsPanel quando activeTab === 'settings'
  if (activeTab === 'settings') {
    return <SettingsPanel />;
  }

  // Renderizar ActivityLog quando activeTab === 'activity'
  if (activeTab === 'activity') {
    return (
      <div className="flex-1 overflow-hidden bg-[#0d0d0d]">
        <ActivityLog />
      </div>
    );
  }

  // Empty state - no active conversation OR no messages yet
  const hasMessages = activeChat?.messages && activeChat.messages.length > 0;
  const showEmptyState = !activeChat || (!hasMessages && !activeChat?.isStreaming && !activeChat?.isThinking);

  if (showEmptyState) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0d]">
        <div className="text-center max-w-md px-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={trIcon} alt="TR Logo" width="32" height="32" className="flex-shrink-0" />
            <h1 className="text-2xl font-light tracking-wide text-white">Korix Code</h1>
          </div>
          <p className="text-sm opacity-50 leading-relaxed text-white">
            AI-native coding assistant powered by Axiom Agents
          </p>
          <p className="text-xs opacity-40 mt-3 text-white">
            {activeChat ? 'Start typing to begin...' : 'Create a new session to start chatting'}
          </p>
        </div>
      </div>
    );
  }

  // Render active conversation
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-[#0d0d0d]"
    >
      {/* Messages */}
      {activeChat.messages?.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {/* Thinking content - antes do streaming */}
      {activeChat.isThinking && activeChat.thinkingContent && (
        <div className="px-3 py-3 bg-[var(--vscode-input-background)]/30 rounded-lg mb-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-[var(--vscode-descriptionForeground)]">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Pensando...</span>
          </div>
          <div className="text-sm text-[var(--vscode-descriptionForeground)] italic">
            {activeChat.thinkingContent}
          </div>
        </div>
      )}

      {/* Streaming content - sem avatar, sem header, COM REF para auto-scroll */}
      {activeChat.isStreaming && activeChat.streamingContent && (
        <div ref={streamingRef} className="px-3 py-3">
          <MarkdownContent content={activeChat.streamingContent} />
        </div>
      )}
    </div>
  );
}
