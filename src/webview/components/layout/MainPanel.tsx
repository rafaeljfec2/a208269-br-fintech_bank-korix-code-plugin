/**
 * MainPanel - Active conversation chat area
 */

import React from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';

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
        <div key={msg.id} className="flex gap-3">
          {msg.role === 'assistant' && (
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-xs">
              K
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs opacity-50 mb-1">
              {msg.role === 'user' ? 'You' : 'Korix'}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
          {msg.role === 'user' && (
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--vscode-input-background)] flex items-center justify-center text-xs opacity-60">
              U
            </div>
          )}
        </div>
      ))}

      {/* Streaming content */}
      {activeChat.isStreaming && activeChat.streamingContent && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-xs">
            K
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs opacity-50 mb-1">Korix</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {activeChat.streamingContent}
              <span className="inline-block w-1.5 h-4 bg-[var(--vscode-button-background)] ml-0.5 animate-pulse"></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
