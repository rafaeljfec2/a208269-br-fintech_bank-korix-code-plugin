/**
 * MainPanel - Active conversation chat area
 */

import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';
import ChatMessage from '../chat/ChatMessage';
import MarkdownContent from '../chat/MarkdownContent';
import StreamingIndicator from '../chat/StreamingIndicator';
import SettingsPanel from '../settings/SettingsPanel';

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

  // Renderizar SettingsPanel quando activeTab === 'settings'
  if (activeTab === 'settings') {
    return <SettingsPanel />;
  }

  // Empty state - no active conversation
  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--vscode-editor-background)]">
        <div className="text-center max-w-md px-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={trIcon} alt="TR Logo" width="32" height="32" className="flex-shrink-0" />
            <h1 className="text-2xl font-light tracking-wide">Korix Code</h1>
          </div>
          <p className="text-sm opacity-50 leading-relaxed">
            AI-native coding assistant powered by Axiom Agents
          </p>
          <p className="text-xs opacity-40 mt-3">
            Create a new session to start chatting
          </p>
        </div>
      </div>
    );
  }

  // Render active conversation
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[var(--vscode-editor-background)]"
    >
      {/* Messages */}
      {activeChat.messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {/* Streaming content - sem avatar, sem header, COM REF para auto-scroll */}
      {activeChat.isStreaming && activeChat.streamingContent && (
        <div ref={streamingRef} className="px-4 py-3">
          <MarkdownContent content={activeChat.streamingContent} />
          <StreamingIndicator />
        </div>
      )}
    </div>
  );
}
