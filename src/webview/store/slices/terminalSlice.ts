/**
 * Terminal slice - terminal sessions and output
 */

import type { StateCreator } from "zustand";

export interface TerminalSession {
  readonly id: string;
  readonly output: string;
  readonly cwd: string;
  readonly createdAt: number;
}

export interface TerminalSlice {
  readonly sessions: Record<string, TerminalSession>;
  readonly activeSessionId: string | null;

  // Actions
  readonly createSession: (id: string, cwd: string) => void;
  readonly appendOutput: (sessionId: string, data: string) => void;
  readonly setActiveSession: (sessionId: string | null) => void;
  readonly closeSession: (sessionId: string) => void;
}

export const createTerminalSlice: StateCreator<TerminalSlice> = (set) => ({
  sessions: {},
  activeSessionId: null,

  createSession: (id, cwd) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: {
          id,
          output: "",
          cwd,
          createdAt: Date.now(),
        },
      },
      activeSessionId: id,
    })),

  appendOutput: (sessionId, data) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            output: session.output + data,
          },
        },
      };
    }),

  setActiveSession: (sessionId) =>
    set(() => ({
      activeSessionId: sessionId,
    })),

  closeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: removed, ...remaining } = state.sessions;
      return {
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }),
});
