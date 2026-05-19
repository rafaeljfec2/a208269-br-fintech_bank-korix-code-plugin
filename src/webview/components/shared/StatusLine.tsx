/**
 * StatusLine - Compact activity indicator for footer
 */

import React from 'react';
import { useStore } from '../../store';

export default function StatusLine() {
  const isExecuting = useStore((state) => state.isExecuting);

  // FIX: Use separate selectors for each primitive value to avoid re-render loops
  const isStreaming = useStore((state) => {
    const activeChatId = state.activeChatId;
    const activeChat = activeChatId ? state.conversations[activeChatId] : null;
    return activeChat?.isStreaming ?? false;
  });

  const isThinking = useStore((state) => {
    const activeChatId = state.activeChatId;
    const activeChat = activeChatId ? state.conversations[activeChatId] : null;
    return activeChat?.isThinking ?? false;
  });

  // Se não há atividade, não mostra nada
  if (!isStreaming && !isThinking && !isExecuting) {
    return null;
  }

  const statusText = isThinking
    ? 'Pensando...'
    : isStreaming
    ? 'Digitando...'
    : 'Executando...';

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editor-background)]">
      {/* Spinner compacto */}
      <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24">
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
      <span>Korix {statusText}</span>
    </div>
  );
}
