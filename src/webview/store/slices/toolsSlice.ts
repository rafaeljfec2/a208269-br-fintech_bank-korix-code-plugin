/**
 * Tools slice - tool calls and approvals
 */

import type { StateCreator } from "zustand";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly status:
    | "pending"
    | "approved"
    | "rejected"
    | "executing"
    | "completed";
  readonly result?: unknown;
  readonly error?: string;
  readonly timestamp: number;
}

export interface PendingApproval {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly description: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly timestamp: number;
}

export interface ToolsSlice {
  readonly toolCalls: readonly ToolCall[];
  readonly pendingApprovals: readonly PendingApproval[];

  // Actions
  readonly addToolCall: (
    toolCall: Omit<ToolCall, "timestamp"> & Partial<Pick<ToolCall, "timestamp">>,
  ) => void;
  readonly updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
  readonly addPendingApproval: (approval: PendingApproval) => void;
  readonly removePendingApproval: (toolCallId: string) => void;
  readonly clearToolCalls: () => void;
}

export const createToolsSlice: StateCreator<ToolsSlice> = (set) => ({
  toolCalls: [],
  pendingApprovals: [],

  addToolCall: (toolCall) =>
    set((state) => ({
      toolCalls: [
        ...state.toolCalls,
        {
          ...toolCall,
          timestamp: toolCall.timestamp ?? Date.now(),
        },
      ],
    })),

  updateToolCall: (id, updates) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc,
      ),
    })),

  addPendingApproval: (approval) =>
    set((state) => ({
      pendingApprovals: [...state.pendingApprovals, approval],
    })),

  removePendingApproval: (toolCallId) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter(
        (pa) => pa.toolCallId !== toolCallId,
      ),
    })),

  clearToolCalls: () =>
    set(() => ({
      toolCalls: [],
      pendingApprovals: [],
    })),
});
