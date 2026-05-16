/**
 * App - Main React application
 * Claude.ai-inspired layout: TopBar + MainPanel + BottomBar + SidebarDrawer
 */

import React, { useState } from 'react';
import { useRuntimeEvents } from './hooks/useRuntimeEvents';
import TopBar from './components/layout/TopBar';
import BottomBar from './components/layout/BottomBar';
import SidebarDrawer from './components/layout/SidebarDrawer';
import MainPanel from './components/layout/MainPanel';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Setup event streaming from extension
  useRuntimeEvents();

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] overflow-hidden">
      {/* Top Bar - Session tabs */}
      <TopBar onMenuClick={() => setIsMenuOpen(true)} />

      {/* Main Content Area */}
      <div className="flex-1 min-h-0">
        <MainPanel />
      </div>

      {/* Bottom Bar - Input + Controls */}
      <BottomBar />

      {/* Sidebar Drawer (hidden by default) */}
      <SidebarDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </div>
  );
}
