/**
 * SidebarDrawer - Modal/drawer for sessions, modes, settings
 * Opens from TopBar menu button
 */

import React from 'react';
import { useStore } from '../../store';

interface Session {
  id: string;
  name: string;
  timestamp: string;
}

const mockSessions: Session[] = [
  { id: '1', name: 'Docker containerização', timestamp: 'just now' },
  { id: '2', name: 'API com Go + PostgreSQL', timestamp: '2h ago' },
  { id: '3', name: 'Microserviço de pagamentos', timestamp: 'Yesterday' },
  { id: '4', name: 'Refatorar autenticação', timestamp: '2 days ago' },
  { id: '5', name: 'Otimização de queries', timestamp: '3 days ago' },
];

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidebarDrawer({ isOpen, onClose }: SidebarDrawerProps) {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);
  const setActiveTab = useStore((state) => state.setActiveTab);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-panel-border)] z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex items-center justify-between">
          <h1 className="text-xs font-medium tracking-wide opacity-60">KORIX CODE</h1>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded opacity-60 hover:opacity-100"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
            </svg>
          </button>
        </div>

        {/* New Session */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded-sm text-xs font-medium">
            <span style={{ fontSize: '14px' }}>📂</span>
            <span>New Session</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            placeholder="Search sessions"
            className="w-full px-2 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-sm text-xs focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Sessions */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-medium opacity-40 mb-2 tracking-wider uppercase">SESSIONS</div>
            <div className="space-y-0.5">
              {mockSessions.map((session) => (
                <div
                  key={session.id}
                  className="px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded-sm cursor-pointer"
                  onClick={onClose}
                >
                  <div className="text-xs">{session.name}</div>
                  <div className="text-[10px] opacity-40">{session.timestamp}</div>
                </div>
              ))}
              <button className="text-[10px] opacity-40 hover:opacity-100 px-2 py-1">
                Show more...
              </button>
            </div>
          </div>

          {/* Modes */}
          <div className="px-3 py-3 border-t border-[var(--vscode-panel-border)]">
            <div className="text-[10px] font-medium opacity-40 mb-2 tracking-wider uppercase">MODES</div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setMode('ask');
                  onClose();
                }}
                className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-sm text-left ${
                  mode === 'ask'
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <span style={{ fontSize: '14px' }}>💬</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Ask</div>
                  <div className="text-[10px] opacity-50 leading-snug">Fazer perguntas e obter respostas</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setMode('plan');
                  onClose();
                }}
                className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-sm text-left ${
                  mode === 'plan'
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <span style={{ fontSize: '14px' }}>📋</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Plan</div>
                  <div className="text-[10px] opacity-50 leading-snug">Planejar e decompor tarefas</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setMode('agent');
                  onClose();
                }}
                className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-sm text-left ${
                  mode === 'agent'
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <span style={{ fontSize: '14px' }}>🤖</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Agent</div>
                  <div className="text-[10px] opacity-50 leading-snug">Executar tarefas e editar código</div>
                </div>
              </button>
            </div>
          </div>

          {/* Tools */}
          <div className="px-3 py-3 border-t border-[var(--vscode-panel-border)]">
            <div className="text-[10px] font-medium opacity-40 mb-2 tracking-wider uppercase">TOOLS</div>
            <div className="space-y-0.5">
              {[
                'File System',
                'Terminal',
                'Git',
                'Search',
                'Diagnostics',
                'Docker',
              ].map((tool) => (
                <div
                  key={tool}
                  className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[var(--vscode-list-hoverBackground)] rounded-sm cursor-pointer"
                >
                  <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                  <span>{tool}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--vscode-panel-border)] px-3 py-2">
          <button
            onClick={() => {
              console.log('[SidebarDrawer] Settings button clicked, changing tab to settings');
              setActiveTab('settings');
              onClose(); // Fecha drawer após clicar
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded-sm text-xs"
          >
            <span style={{ fontSize: '14px' }}>⚙️</span>
            <span>Settings</span>
          </button>
          <div className="mt-2 px-2 py-1">
            <div className="text-xs font-medium">rafael.ferreira</div>
            <div className="text-[10px] opacity-40">Enterprise Plan</div>
          </div>
        </div>
      </div>
    </>
  );
}
