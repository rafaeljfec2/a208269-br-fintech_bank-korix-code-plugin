/**
 * Runtime slice - execution state and metrics
 */

export interface RuntimeMetrics {
  readonly tokenCount: number;
  readonly toolCallCount: number;
  readonly iterationCount: number;
}

export interface RuntimeSlice {
  readonly isExecuting: boolean;
  readonly currentIteration: number;
  readonly metrics: RuntimeMetrics;
  readonly mode: 'ask' | 'plan' | 'agent';
  readonly model: string;
  
  // Actions
  readonly setExecuting: (isExecuting: boolean) => void;
  readonly setIteration: (iteration: number) => void;
  readonly updateMetrics: (metrics: Partial<RuntimeMetrics>) => void;
  readonly setMode: (mode: 'ask' | 'plan' | 'agent') => void;
  readonly setModel: (model: string) => void;
}

export const createRuntimeSlice = (set: any): RuntimeSlice => ({
  isExecuting: false,
  currentIteration: 0,
  metrics: {
    tokenCount: 0,
    toolCallCount: 0,
    iterationCount: 0,
  },
  mode: 'agent',
  model: 'claude-opus-4-7',

  setExecuting: (isExecuting) =>
    set({ isExecuting }),

  setIteration: (iteration) =>
    set({ currentIteration: iteration }),

  updateMetrics: (newMetrics) =>
    set((state: RuntimeSlice) => ({
      metrics: { ...state.metrics, ...newMetrics },
    })),

  setMode: (mode) =>
    set({ mode }),

  setModel: (model) =>
    set({ model }),
});
