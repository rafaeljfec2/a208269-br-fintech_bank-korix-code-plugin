/**
 * Activity slice - registra toda movimentação do plugin em log estruturado
 * Inspirado no ActivityFeed do Axiom Chat
 */

import type { StateCreator } from "zustand";

export interface ActivityItem {
  readonly id: string;
  readonly timestamp: number;
  readonly category:
    | "execution"
    | "tool"
    | "thinking"
    | "checkpoint"
    | "error"
    | "user_action";
  readonly context: string; // Agrupamento: "Iteration 1", "Tool Execution", etc
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
  readonly status?: "pending" | "success" | "error";
  readonly duration?: number;
}

export interface ActivityContext {
  readonly id: string;
  readonly name: string; // "Iteration 1", "Read File Operation"
  readonly startTime: number;
  readonly endTime?: number;
  readonly items: ActivityItem[];
  readonly isExpanded: boolean;
}

export interface ActivitySlice {
  readonly contexts: ActivityContext[];
  readonly currentContextId: string | null;

  // Actions
  readonly startContext: (name: string) => string; // Returns context ID
  readonly endContext: (contextId: string) => void;
  readonly addActivityItem: (
    contextId: string,
    item: Omit<ActivityItem, "id" | "timestamp">,
  ) => void;
  readonly toggleContext: (contextId: string) => void;
  readonly clearActivity: () => void;
}

export const createActivitySlice: StateCreator<
  ActivitySlice,
  [],
  [],
  ActivitySlice
> = (set, _get, _api) => ({
  contexts: [],
  currentContextId: null,

  startContext: (name) => {
    const contextId = crypto.randomUUID();
    set((state: ActivitySlice) => ({
      contexts: [
        ...state.contexts,
        {
          id: contextId,
          name,
          startTime: Date.now(),
          items: [],
          isExpanded: true, // Auto-expand contextos novos
        },
      ],
      currentContextId: contextId,
    }));
    return contextId;
  },

  endContext: (contextId) =>
    set((state: ActivitySlice) => ({
      contexts: state.contexts.map((ctx) =>
        ctx.id === contextId
          ? { ...ctx, endTime: Date.now(), isExpanded: false } // Auto-colapsar ao finalizar
          : ctx,
      ),
      currentContextId: null,
    })),

  addActivityItem: (contextId, item) =>
    set((state: ActivitySlice) => ({
      contexts: state.contexts.map((ctx) =>
        ctx.id === contextId
          ? {
              ...ctx,
              items: [
                ...ctx.items,
                {
                  ...item,
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                },
              ],
            }
          : ctx,
      ),
    })),

  toggleContext: (contextId) =>
    set((state: ActivitySlice) => ({
      contexts: state.contexts.map((ctx) =>
        ctx.id === contextId ? { ...ctx, isExpanded: !ctx.isExpanded } : ctx,
      ),
    })),

  clearActivity: () => set({ contexts: [], currentContextId: null }),
});
