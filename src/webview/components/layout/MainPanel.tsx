/**
 * MainPanel - Active conversation chat area
 */

import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';
import ChatMessage from '../chat/ChatMessage';
import MarkdownContent from '../chat/MarkdownContent';
import EmptyChatWelcome from '../chat/EmptyChatWelcome';
import SettingsPanel from '../settings/SettingsPanel';
import ActivityLog from '../activity/ActivityLog';
import RuntimeInspector from '../runtime/RuntimeInspector';
import TerminalPanel from '../terminal/TerminalPanel';
import ThinkingContainer from '../thinking/ThinkingContainer';

export default function MainPanel() {
  // Fine-grained selectors para evitar re-renders em cascata
  const activeChatId = useStore((state) => state.activeChatId);
  const activeTab = useStore((state) => state.activeTab);

  // Selector específico para active chat (não pega conversations inteiro)
  const activeChat = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId] : null
  );

  // Selectors granulares para propriedades do chat ativo
  const isStreaming = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId]?.isStreaming : false
  );
  const streamingContent = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId]?.streamingContent : ''
  );
  const messages = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId]?.messages : []
  );
  const isThinking = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId]?.isThinking : false
  );
  const activeThinkingItems = useStore((state) =>
    state.activeChatId ? state.conversations[state.activeChatId]?.activeThinkingItems : []
  );

  // Refs para auto-scroll
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<HTMLDivElement>(null);
  const scrollDebounceRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);

  // Track if user scrolled away from bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < 100; // 100px threshold
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Debounced auto-scroll during streaming
  useEffect(() => {
    if (!isStreaming || !isNearBottomRef.current) return;

    // Clear existing debounce
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    // Debounce to 200ms - only scroll if tokens stop arriving
    scrollDebounceRef.current = window.setTimeout(() => {
      streamingRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }, 200) as unknown as number;

    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
    };
  }, [isStreaming, streamingContent]);

  // Scroll to bottom after streaming completes
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [isStreaming, messages.length]);

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

  // Empty state - only show when truly empty (no active chat)
  if (!activeChat) {
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
            Create a new session to start chatting
          </p>
        </div>
      </div>
    );
  }

  // Check if chat is truly empty (no messages, not thinking, not streaming)
  const isChatEmpty =
    (!activeChat.messages || activeChat.messages.length === 0) &&
    !activeChat.isThinking &&
    !activeChat.isStreaming;

  // Render active conversation
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-[#0d0d0d]"
    >
      {/* Welcome message when chat is empty */}
      {isChatEmpty && <EmptyChatWelcome />}

      {/* Messages */}
      {activeChat.messages?.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {/* Safe thinking timeline - no raw provider thinking */}
      {activeThinkingItems && activeThinkingItems.length > 0 && (
        <ThinkingContainer items={activeThinkingItems} defaultExpanded={true} />
      )}

      {/* Streaming content - sem avatar, sem header, COM REF para auto-scroll */}
      {activeChat.isStreaming && activeChat.streamingContent && (
        <div ref={streamingRef} className="px-3 py-3">
          <MarkdownContent content={activeChat.streamingContent} isStreaming={true} />
        </div>
      )}
    </div>
  );
}
