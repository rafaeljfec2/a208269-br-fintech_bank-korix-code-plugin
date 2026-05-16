/**
 * Timeline slice - execution event log
 */

export interface TimelineItem {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly timestamp: number;
  readonly status?: 'pending' | 'success' | 'error';
  readonly metadata?: Record<string, unknown>;
}

export interface TimelineSlice {
  readonly items: TimelineItem[];
  
  // Actions
  readonly addTimelineEvent: (event: Omit<TimelineItem, 'id' | 'timestamp'>) => void;
  readonly updateTimelineItem: (id: string, updates: Partial<TimelineItem>) => void;
  readonly clearTimeline: () => void;
}

export const createTimelineSlice = (set: any): TimelineSlice => ({
  items: [],

  addTimelineEvent: (event) =>
    set((state: TimelineSlice) => ({
      items: [
        ...state.items,
        {
          ...event,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  updateTimelineItem: (id, updates) =>
    set((state: TimelineSlice) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  clearTimeline: () =>
    set({ items: [] }),
});
