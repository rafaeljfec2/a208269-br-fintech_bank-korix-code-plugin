/**
 * Root Zustand store - combines all slices
 */

import { create } from 'zustand';
import { createChatSlice, type ChatSlice } from './slices/chatSlice';
import { createRuntimeSlice, type RuntimeSlice } from './slices/runtimeSlice';
import { createTimelineSlice, type TimelineSlice } from './slices/timelineSlice';
import { createTerminalSlice, type TerminalSlice } from './slices/terminalSlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createToolsSlice, type ToolsSlice } from './slices/toolsSlice';

export type RootStore = ChatSlice & RuntimeSlice & TimelineSlice & TerminalSlice & SettingsSlice & ToolsSlice;

export const useStore = create<RootStore>((set, get) => ({
  ...createChatSlice(set),
  ...createRuntimeSlice(set),
  ...createTimelineSlice(set),
  ...createTerminalSlice(set),
  ...createSettingsSlice(set),
  ...createToolsSlice(set),
}));

// Export types for external use
export type { Message } from './slices/chatSlice';
export type { TimelineItem } from './slices/timelineSlice';
export type { RuntimeMetrics } from './slices/runtimeSlice';
export type { TerminalSession } from './slices/terminalSlice';
