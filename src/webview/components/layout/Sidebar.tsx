/**
 * Sidebar - Sessions, Modes, Tools
 * Cursor-inspired left panel
 */

import React, { useState } from 'react';
import { useStore } from '../../store';
import RuntimeInspector from '../runtime/RuntimeInspector';
import CheckpointList from '../checkpoints/CheckpointList';

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

export default function Sidebar() {
  const [expandedSection, setExpandedSection] = useState<'inspector' | 'checkpoints' | null>(null);
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);

  return (
    <div className="h-full w-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-panel-border)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--vscode-panel-border)]">
        <h1 className="text-sm font-semibold mb-3">KORIX CODE</h1>
        <button className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded text-sm">
          <span>📂</span>
          <span>New Session</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <input
          type="text"
          placeholder="Search sessions"
          className="w-full px-3 py-1.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)] rounded text-sm focus:outline-none focus:border-[var(--vscode-focusBorder)]"
        />
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <div className="text-xs font-semibold opacity-60 mb-2">SESSIONS</div>
          <div className="space-y-1">
            {mockSessions.map((session) => (
              <div
                key={session.id}
                className="px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded cursor-pointer"
              >
                <div className="text-sm">{session.name}</div>
                <div className="text-xs opacity-50">{session.timestamp}</div>
              </div>
            ))}
            <button className="text-xs opacity-60 hover:opacity-100 px-3 py-2">
              Show more...
            </button>
          </div>
        </div>

        {/* Modes */}
        <div className="px-4 py-4 border-t border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold opacity-60 mb-3">MODES</div>
          <div className="space-y-2">
            <button
              onClick={() => setMode('ask')}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left ${
                mode === 'ask'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              <span className="text-lg">💬</span>
              <div>
                <div className="text-sm font-medium">Ask</div>
                <div className="text-xs opacity-60">Fazer perguntas e obter respostas</div>
              </div>
            </button>

            <button
              onClick={() => setMode('plan')}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left ${
                mode === 'plan'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              <span className="text-lg">📋</span>
              <div>
                <div className="text-sm font-medium">Plan</div>
                <div className="text-xs opacity-60">Planejar e decompor tarefas</div>
              </div>
            </button>

            <button
              onClick={() => setMode('agent')}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded text-left ${
                mode === 'agent'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-sm font-medium">Agent</div>
                <div className="text-xs opacity-60">Executar tarefas e editar código</div>
              </div>
            </button>
          </div>
        </div>

        {/* Tools */}
        <div className="px-4 py-4 border-t border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold opacity-60 mb-3">TOOLS</div>
          <div className="space-y-1">
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
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--vscode-list-hoverBackground)] rounded cursor-pointer"
              >
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span>{tool}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Runtime Section */}
        <div className="px-4 py-4 border-t border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold opacity-60 mb-3">RUNTIME</div>
          <div className="space-y-2">
            {/* Inspector */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'inspector' ? null : 'inspector')
                }
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-sm"
              >
                <span>Inspector</span>
                <span>{expandedSection === 'inspector' ? '▼' : '▶'}</span>
              </button>
              {expandedSection === 'inspector' && (
                <div className="mt-2">
                  <RuntimeInspector />
                </div>
              )}
            </div>

            {/* Checkpoints */}
            <div>
              <button
                onClick={() =>
                  setExpandedSection(
                    expandedSection === 'checkpoints' ? null : 'checkpoints',
                  )
                }
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-sm"
              >
                <span>Checkpoints</span>
                <span>{expandedSection === 'checkpoints' ? '▼' : '▶'}</span>
              </button>
              {expandedSection === 'checkpoints' && (
                <div className="mt-2 max-h-60 overflow-y-auto">
                  <CheckpointList />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--vscode-panel-border)] p-4">
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-sm">
          <span>⚙️</span>
          <span>Settings</span>
        </button>
        <div className="mt-3 px-3">
          <div className="text-sm">rafael.ferreira</div>
          <div className="text-xs opacity-50">Enterprise Plan</div>
        </div>
      </div>
    </div>
  );
}
