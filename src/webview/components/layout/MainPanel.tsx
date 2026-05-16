/**
 * MainPanel - Chat area + Execution timeline + Terminal
 * Main content area with tabs
 */

import React, { useState } from 'react';
import { useStore } from '../../store';
import trIcon from '../../assets/tr-icon.svg';
import TerminalPanel from '../terminal/TerminalPanel';

type Tab = 'chat' | 'timeline' | 'terminal';

export default function MainPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const messages = useStore((state) => state.messages);
  const streamingContent = useStore((state) => state.streamingContent);
  const isStreaming = useStore((state) => state.isStreaming);
  const timelineItems = useStore((state) => state.items);
  const isExecuting = useStore((state) => state.isExecuting);

  const hasContent = messages.length > 0 || isStreaming;

  return (
    <div className="h-full w-full flex flex-col bg-[var(--vscode-editor-background)]">
      {/* Tabs - Show only when there's content */}
      {hasContent && (
        <div className="flex items-center gap-1 px-4 border-b border-[var(--vscode-panel-border)]">
          <TabButton
            label="Chat"
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          />
          <TabButton
            label="Timeline"
            active={activeTab === 'timeline'}
            count={timelineItems.length}
            onClick={() => setActiveTab('timeline')}
          />
          <TabButton
            label="Terminal"
            active={activeTab === 'terminal'}
            onClick={() => setActiveTab('terminal')}
          />
        </div>
      )}

      {/* Empty State - Shows only when no messages and chat tab */}
      {!hasContent && activeTab === 'chat' && (
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={trIcon} alt="TR Logo" width="32" height="32" className="flex-shrink-0" />
              <h1 className="text-2xl font-light tracking-wide">Korix Code</h1>
            </div>
            <p className="text-sm opacity-50 leading-relaxed">
              AI-native coding assistant powered by Axiom Agents
            </p>
            <p className="text-xs opacity-40 mt-3">
              Configure your project with CLAUDE.md to get started
            </p>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {hasContent && (
        <>
          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.map((msg) => (
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

              {isStreaming && streamingContent && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center text-xs">
                    K
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs opacity-50 mb-1">Korix</div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {streamingContent}
                      <span className="inline-block w-1.5 h-4 bg-[var(--vscode-button-background)] ml-0.5 animate-pulse"></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="border border-[var(--vscode-panel-border)] rounded overflow-hidden">
                <div className="px-3 py-2 bg-[var(--vscode-input-background)] border-b border-[var(--vscode-panel-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={isExecuting ? 'text-blue-500' : 'text-green-500'}>
                      {isExecuting ? '⟳' : '✓'}
                    </span>
                    <span className="text-xs font-medium">
                      {isExecuting ? 'Executando...' : 'Execução completa'}
                    </span>
                  </div>
                  <span className="text-xs opacity-50">
                    {timelineItems.length} {timelineItems.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>

                <div className="px-3 py-2 space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {timelineItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-xs"
                    >
                      <span className={item.status === 'error' ? 'text-red-400' : 'text-green-400'}>
                        {item.status === 'error' ? '✗' : '✓'}
                      </span>
                      <span className="flex-1 truncate">{item.description}</span>
                      <span className="px-1.5 py-0.5 bg-[var(--vscode-input-background)] rounded text-xs opacity-60">
                        {getEventBadge(item.type)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Terminal Tab */}
          {activeTab === 'terminal' && <TerminalPanel />}
        </>
      )}

      {/* Terminal Tab - Always accessible even without messages */}
      {!hasContent && activeTab === 'terminal' && <TerminalPanel />}
    </div>
  );
}

function TabButton({
  label,
  active,
  count,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors
        ${
          active
            ? 'border-[var(--vscode-button-background)] text-[var(--vscode-foreground)]'
            : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
        }
      `}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded text-xs">
          {count}
        </span>
      )}
    </button>
  );
}

function getEventBadge(type: string): string {
  const badges: Record<string, string> = {
    iteration: 'Iter',
    tool: 'Tool',
    thinking: 'Think',
    checkpoint: 'Save',
    error: 'Error',
  };

  return badges[type] ?? type.substring(0, 4);
}
