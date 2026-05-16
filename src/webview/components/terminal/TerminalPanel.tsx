/**
 * Terminal Panel - xterm.js integration
 * Full terminal with PTY backend
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import 'xterm/css/xterm.css';
import { useStore } from '../../store';
import { useVSCode } from '../../hooks/useVSCode';

export default function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const sessions = useStore((state) => state.sessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const createSession = useStore((state) => state.createSession);

  const { sendMessage } = useVSCode();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: 'var(--vscode-terminal-background)',
        foreground: 'var(--vscode-terminal-foreground)',
        cursor: 'var(--vscode-terminal-cursor-foreground)',
        selectionBackground: 'var(--vscode-terminal-selectionBackground)',
      },
      allowTransparency: true,
    });

    // Add addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon not available, falling back to canvas renderer');
    }

    // Open terminal
    term.open(terminalRef.current);
    fitAddon.fit();

    // Listen to user input
    term.onData((data: string) => {
      if (activeSessionId) {
        sendMessage({
          type: 'terminal_input',
          payload: { sessionId: activeSessionId, data },
        });
      }
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit on window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [activeSessionId, sendMessage]);

  // Write output to terminal
  useEffect(() => {
    if (!xtermRef.current || !activeSession) return;

    // Clear terminal and write output
    xtermRef.current.clear();
    xtermRef.current.write(activeSession.output);
  }, [activeSession?.output]);

  // Handle new terminal creation
  const handleCreateTerminal = () => {
    sendMessage({
      type: 'create_terminal',
      payload: { shellPath: undefined },
    });
  };

  if (!activeSession) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--vscode-editor-background)]">
        <div className="text-center">
          <p className="text-[var(--vscode-descriptionForeground)] mb-4">
            No terminal session active
          </p>
          <button
            onClick={handleCreateTerminal}
            className="px-4 py-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded text-sm"
          >
            New Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--vscode-terminal-background)]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--vscode-foreground)]">
            {activeSession.cwd}
          </span>
        </div>
        <button
          onClick={handleCreateTerminal}
          className="px-2 py-1 text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded"
        >
          + New
        </button>
      </div>

      {/* xterm.js container */}
      <div ref={terminalRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}
