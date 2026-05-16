/**
 * Terminal slice tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createTerminalSlice, type TerminalSlice } from './terminalSlice';

describe('terminalSlice', () => {
  let store: ReturnType<typeof create<TerminalSlice>>;

  beforeEach(() => {
    store = create<TerminalSlice>(createTerminalSlice);
  });

  describe('initial state', () => {
    it('should initialize with empty sessions', () => {
      const state = store.getState();

      expect(state.sessions).toEqual({});
      expect(state.activeSessionId).toBeNull();
    });
  });

  describe('createSession', () => {
    it('should create new terminal session', () => {
      const { createSession } = store.getState();

      createSession('session-1', '/home/user');

      const state = store.getState();
      expect(Object.keys(state.sessions)).toHaveLength(1);
      expect(state.sessions['session-1']).toBeDefined();
      expect(state.sessions['session-1']?.id).toBe('session-1');
      expect(state.sessions['session-1']?.output).toBe('');
      expect(state.sessions['session-1']?.cwd).toBe('/home/user');
      expect(state.activeSessionId).toBe('session-1');
    });

    it('should set first session as active', () => {
      const { createSession, activeSessionId } = store.getState();

      expect(activeSessionId).toBeNull();

      createSession('first-session', '/workspace');

      const state = store.getState();
      expect(state.activeSessionId).toBe('first-session');
    });

    it('should add multiple sessions', () => {
      const { createSession } = store.getState();

      createSession('session-1', '/home');
      createSession('session-2', '/workspace');

      const state = store.getState();
      expect(Object.keys(state.sessions)).toHaveLength(2);
      expect(state.sessions['session-1']).toBeDefined();
      expect(state.sessions['session-2']).toBeDefined();
      expect(state.activeSessionId).toBe('session-2');
    });
  });

  describe('appendOutput', () => {
    it('should append output to session', () => {
      const { createSession, appendOutput } = store.getState();

      createSession('session-1', '/home');
      appendOutput('session-1', 'Hello World\n');

      const state = store.getState();
      expect(state.sessions['session-1']?.output).toBe('Hello World\n');
    });

    it('should concatenate multiple outputs', () => {
      const { createSession, appendOutput } = store.getState();

      createSession('session-1', '/home');
      appendOutput('session-1', 'First\n');
      appendOutput('session-1', 'Second\n');

      const state = store.getState();
      expect(state.sessions['session-1']?.output).toBe('First\nSecond\n');
    });

    it('should not modify state if session does not exist', () => {
      const { appendOutput } = store.getState();

      const before = store.getState();
      appendOutput('non-existent', 'output');
      const after = store.getState();

      expect(after).toBe(before);
    });
  });

  describe('setActiveSession', () => {
    it('should switch active session', () => {
      const { createSession, setActiveSession } = store.getState();

      createSession('session-1', '/home');
      createSession('session-2', '/workspace');
      setActiveSession('session-1');

      const state = store.getState();
      expect(state.activeSessionId).toBe('session-1');
    });

    it('should allow setting to null', () => {
      const { createSession, setActiveSession } = store.getState();

      createSession('session-1', '/home');
      setActiveSession(null);

      const state = store.getState();
      expect(state.activeSessionId).toBeNull();
    });
  });

  describe('closeSession', () => {
    it('should remove session', () => {
      const { createSession, closeSession } = store.getState();

      createSession('session-1', '/home');
      closeSession('session-1');

      const state = store.getState();
      expect(Object.keys(state.sessions)).toHaveLength(0);
      expect(state.sessions['session-1']).toBeUndefined();
    });

    it('should clear active if closing active session', () => {
      const { createSession, closeSession } = store.getState();

      createSession('session-1', '/home');
      expect(store.getState().activeSessionId).toBe('session-1');

      closeSession('session-1');

      const state = store.getState();
      expect(state.activeSessionId).toBeNull();
    });

    it('should keep other sessions when closing one', () => {
      const { createSession, closeSession } = store.getState();

      createSession('session-1', '/home');
      createSession('session-2', '/workspace');
      createSession('session-3', '/tmp');
      closeSession('session-2');

      const state = store.getState();
      expect(Object.keys(state.sessions)).toHaveLength(2);
      expect(state.sessions['session-1']).toBeDefined();
      expect(state.sessions['session-3']).toBeDefined();
      expect(state.sessions['session-2']).toBeUndefined();
    });

    it('should not change active if closing non-active session', () => {
      const { createSession, closeSession, setActiveSession } = store.getState();

      createSession('session-1', '/home');
      createSession('session-2', '/workspace');
      setActiveSession('session-1');
      closeSession('session-2');

      const state = store.getState();
      expect(state.activeSessionId).toBe('session-1');
    });
  });
});
