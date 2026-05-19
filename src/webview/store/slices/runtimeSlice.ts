/**
 * Runtime slice - execution state and metrics
 */

import { logger } from "../../utils/logger";

export interface RuntimeMetrics {
  readonly tokenCount: number;
  readonly toolCallCount: number;
  readonly iterationCount: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedTokens?: number;
}

export interface CompletionStats {
  readonly iterations: number;
  readonly toolCalls: number;
  readonly tokens: number;
  readonly duration: number; // seconds
  readonly timestamp: number;
}

export interface RuntimeSlice {
  readonly isExecuting: boolean;
  readonly currentIteration: number;
  readonly metrics: RuntimeMetrics;
  readonly completionStats: CompletionStats | null;
  readonly mode: "ask" | "plan" | "agent";
  readonly model: string;

  // Actions
  readonly setExecuting: (isExecuting: boolean) => void;
  readonly setIteration: (iteration: number) => void;
  readonly updateMetrics: (metrics: Partial<RuntimeMetrics>) => void;
  readonly setCompletionStats: (stats: CompletionStats | null) => void;
  readonly setMode: (mode: "ask" | "plan" | "agent") => void;
  readonly setModel: (model: string) => void;
}

export const createRuntimeSlice = (
  set: (partial: Partial<RuntimeSlice> | ((state: RuntimeSlice) => Partial<RuntimeSlice>)) => void
): RuntimeSlice => ({
  isExecuting: false,
  currentIteration: 0,
  metrics: {
    tokenCount: 0,
    toolCallCount: 0,
    iterationCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
  },
  completionStats: null,
  mode: "agent",
  model: "claude-opus-4-7",

  setExecuting: (isExecuting) =>
    set((state: RuntimeSlice) => {
      logger.log("[RuntimeSlice] setExecuting transition", {
        from: state.isExecuting,
        to: isExecuting,
      });
      return { isExecuting };
    }),

  setIteration: (iteration) => set({ currentIteration: iteration }),

  updateMetrics: (newMetrics) =>
    set((state: RuntimeSlice) => ({
      metrics: { ...state.metrics, ...newMetrics },
    })),

  setCompletionStats: (stats) => set({ completionStats: stats }),

  setMode: (mode) => set({ mode }),

  setModel: (model) => set({ model }),
});
