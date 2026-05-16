/**
 * Root Zustand store - combines all slices
 */

import { create } from 'zustand';
import { createChatSlice, type ChatSlice } from './slices/chatSlice';
import { createRuntimeSlice, type RuntimeSlice } from './slices/runtimeSlice';
import { createTimelineSlice, type TimelineSlice } from './slices/timelineSlice';

export type RootStore = ChatSlice & RuntimeSlice & TimelineSlice;

export const useStore = create<RootStore>((set, get) => ({
  ...createChatSlice(set),
  ...createRuntimeSlice(set),
  ...createTimelineSlice(set),
}));

// Export types for external use
export type { Message } from './slices/chatSlice';
export type { TimelineItem } from './slices/timelineSlice';
export type { RuntimeMetrics } from './slices/runtimeSlice';
