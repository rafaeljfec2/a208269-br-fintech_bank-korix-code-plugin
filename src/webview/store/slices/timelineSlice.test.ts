/**
 * Timeline slice tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createTimelineSlice, type TimelineSlice } from './timelineSlice';

describe('timelineSlice', () => {
  let store: ReturnType<typeof create<TimelineSlice>>;

  beforeEach(() => {
    store = create<TimelineSlice>(createTimelineSlice);
  });

  describe('initial state', () => {
    it('should initialize with empty timeline', () => {
      const state = store.getState();

      expect(state.items).toEqual([]);
    });
  });

  describe('addTimelineEvent', () => {
    it('should add event to timeline', () => {
      const { addTimelineEvent } = store.getState();

      addTimelineEvent({
        type: 'iteration_start',
        description: 'Starting iteration 1',
      });

      const state = store.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0]?.id).toBeDefined();
      expect(state.items[0]?.type).toBe('iteration_start');
      expect(state.items[0]?.timestamp).toBeGreaterThan(0);
    });

    it('should append events in chronological order', () => {
      const { addTimelineEvent } = store.getState();

      addTimelineEvent({ type: 'iteration_start', description: 'First' });
      addTimelineEvent({ type: 'token', description: 'Second' });
      addTimelineEvent({ type: 'tool_call', description: 'Third' });

      const state = store.getState();
      expect(state.items).toHaveLength(3);
      expect(state.items[0]?.description).toBe('First');
      expect(state.items[1]?.description).toBe('Second');
      expect(state.items[2]?.description).toBe('Third');
    });

    it('should include optional status field', () => {
      const { addTimelineEvent } = store.getState();

      addTimelineEvent({
        type: 'tool_call',
        description: 'ReadFile executed',
        status: 'success',
      });

      const state = store.getState();
      expect(state.items[0]?.status).toBe('success');
    });

    it('should include optional metadata field', () => {
      const { addTimelineEvent } = store.getState();

      addTimelineEvent({
        type: 'checkpoint_created',
        description: 'Checkpoint saved',
        metadata: { files: ['a.ts', 'b.ts'] },
      });

      const state = store.getState();
      expect(state.items[0]?.metadata).toEqual({ files: ['a.ts', 'b.ts'] });
    });
  });

  describe('clearTimeline', () => {
    it('should remove all items', () => {
      const { addTimelineEvent, clearTimeline } = store.getState();

      addTimelineEvent({ type: 'token', description: 'First' });
      addTimelineEvent({ type: 'token', description: 'Second' });
      clearTimeline();

      const state = store.getState();
      expect(state.items).toEqual([]);
    });
  });

  describe('updateTimelineItem', () => {
    it('should update existing item', () => {
      const { addTimelineEvent, updateTimelineItem } = store.getState();

      addTimelineEvent({
        type: 'tool_call',
        description: 'ReadFile executing',
        status: 'pending',
      });

      const itemId = store.getState().items[0]?.id ?? '';
      updateTimelineItem(itemId, { status: 'success', description: 'ReadFile completed' });

      const state = store.getState();
      expect(state.items[0]?.status).toBe('success');
      expect(state.items[0]?.description).toBe('ReadFile completed');
    });

    it('should not modify item if id not found', () => {
      const { addTimelineEvent, updateTimelineItem } = store.getState();

      addTimelineEvent({ type: 'token', description: 'Original' });
      updateTimelineItem('non-existent', { description: 'Modified' });

      const state = store.getState();
      expect(state.items[0]?.description).toBe('Original');
    });

    it('should preserve unmodified fields', () => {
      const { addTimelineEvent, updateTimelineItem } = store.getState();

      addTimelineEvent({
        type: 'tool_call',
        description: 'Original',
        status: 'pending',
        metadata: { file: 'test.ts' },
      });

      const state1 = store.getState();
      const itemId = state1.items[0]?.id ?? '';
      const timestamp = state1.items[0]?.timestamp ?? 0;

      updateTimelineItem(itemId, { status: 'success' });

      const state = store.getState();
      expect(state.items[0]?.id).toBe(itemId);
      expect(state.items[0]?.type).toBe('tool_call');
      expect(state.items[0]?.timestamp).toBe(timestamp);
      expect(state.items[0]?.description).toBe('Original');
      expect(state.items[0]?.metadata).toEqual({ file: 'test.ts' });
    });
  });
});
