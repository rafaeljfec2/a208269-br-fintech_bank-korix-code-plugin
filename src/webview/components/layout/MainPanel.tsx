/**
 * MainPanel - Active conversation chat area
 */

import React from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';
import ChatMessage from '../chat/ChatMessage';
import MarkdownContent from '../chat/MarkdownContent';
import StreamingIndicator from '../chat/StreamingIndicator';

export default function MainPanel() {
  // Use selectors separados para evitar re-renders desnecessários
  const conversations = useStore((state) => state.conversations);
  const activeChatId = useStore((state) => state.activeChatId);

  const activeChat = activeChatId ? conversations[activeChatId] : null;

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
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[var(--vscode-editor-background)]">
      {/* Messages */}
      {activeChat.messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {/* Streaming content */}
      {activeChat.isStreaming && activeChat.streamingContent && (
        <div className="flex gap-3 px-4 py-3">
          <div className="w-7 h-7 rounded-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] flex items-center justify-center text-xs font-semibold flex-shrink-0">
            K
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2 text-xs opacity-60">
              <span>Korix</span>
              <span>just now</span>
            </div>
            <div className="text-sm leading-relaxed">
              <MarkdownContent content={activeChat.streamingContent} />
              <StreamingIndicator />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
