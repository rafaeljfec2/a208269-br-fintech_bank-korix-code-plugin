/**
 * App - Main React application
 * Claude.ai-inspired layout: TabBar + MainPanel + BottomBar + SidebarDrawer
 */

import React, { useState } from 'react';
import { useRuntimeEvents } from './hooks/useRuntimeEvents';
import TabBar from './components/layout/TopBar';
import BottomBar from './components/layout/BottomBar';
import SidebarDrawer from './components/layout/SidebarDrawer';
import MainPanel from './components/layout/MainPanel';
import ToolApprovalModal from './components/tools/ToolApprovalModal';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Setup event streaming from extension
  useRuntimeEvents();

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] overflow-hidden">
      {/* Tab Bar - Multiple session tabs */}
      <TabBar onMenuClick={() => setIsMenuOpen(true)} />

      {/* Main Content Area */}
      <MainPanel />

      {/* Bottom Bar - Input + Controls */}
      <BottomBar />

      {/* Sidebar Drawer (hidden by default) */}
      <SidebarDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      {/* Tool Approval Modal - Renders conditionally when approval is needed */}
      <ToolApprovalModal />
    </div>
  );
}
