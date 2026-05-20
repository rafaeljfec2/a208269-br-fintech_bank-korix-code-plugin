/**
 * App - Main React application
 * Layout: TopBar + (Sidebar + ResizeHandle + MainPanel) + BottomBar
 */

import React, { useEffect } from 'react';
import { useRuntimeEvents } from './hooks/useRuntimeEvents';
import { useExecutionTimeout } from './hooks/useExecutionTimeout';
import { useStore } from './store';
import TabBar from './components/layout/TopBar';
import BottomBar from './components/layout/BottomBar';
import Sidebar from './components/layout/Sidebar';
import ResizeHandle from './components/layout/ResizeHandle';
import MainPanel from './components/layout/MainPanel';

export default function App() {
  const sidebarVisible = useStore((state) => state.sidebarVisible);

  // Setup event streaming from extension
  useRuntimeEvents();

  // Safety timeout: force clear execution state after 120s
  useExecutionTimeout();

  // Create initial conversation if none exists
  useEffect(() => {
    const { conversations, createChat } = useStore.getState();
    if (Object.keys(conversations).length === 0) {
      createChat('Nova conversa');
    }
  }, []);

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] overflow-hidden">
      {/* Top Bar */}
      <TabBar />

      {/* Horizontal Split: Sidebar + MainPanel */}
      <div className="flex-1 flex min-h-0">
        {sidebarVisible && (
          <>
            <Sidebar />
            <ResizeHandle />
          </>
        )}
        <MainPanel />
      </div>

      {/* Bottom Bar - Input + Controls + Status */}
      <BottomBar />
    </div>
  );
}
