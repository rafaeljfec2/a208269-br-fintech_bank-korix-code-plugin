/**
 * Tools slice tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createToolsSlice, type ToolsSlice } from "./toolsSlice";

describe("toolsSlice", () => {
  let store: ReturnType<typeof create<ToolsSlice>>;

  beforeEach(() => {
    store = create<ToolsSlice>(createToolsSlice);
  });

  describe("initial state", () => {
    it("should initialize with empty arrays", () => {
      const state = store.getState();

      expect(state.pendingApprovals).toEqual([]);
      expect(state.toolCalls).toEqual([]);
    });
  });

  describe("addPendingApproval", () => {
    it("should add approval request", () => {
      const { addPendingApproval } = store.getState();

      addPendingApproval({
        toolCallId: "tool-1",
        toolName: "ReadFile",
        input: { path: "test.ts" },
        description: "Read file test.ts",
        riskLevel: "low",
        timestamp: Date.now(),
      });

      const state = store.getState();
      expect(state.pendingApprovals).toHaveLength(1);
      expect(state.pendingApprovals[0]?.toolCallId).toBe("tool-1");
      expect(state.pendingApprovals[0]?.toolName).toBe("ReadFile");
    });

    it("should append multiple approvals", () => {
      const { addPendingApproval } = store.getState();

      addPendingApproval({
        toolCallId: "1",
        toolName: "ReadFile",
        input: { path: "a.ts" },
        description: "Read a.ts",
        riskLevel: "low",
        timestamp: Date.now(),
      });
      addPendingApproval({
        toolCallId: "2",
        toolName: "WriteFile",
        input: { path: "b.ts" },
        description: "Write b.ts",
        riskLevel: "medium",
        timestamp: Date.now(),
      });

      const state = store.getState();
      expect(state.pendingApprovals).toHaveLength(2);
      expect(state.pendingApprovals[0]?.toolCallId).toBe("1");
      expect(state.pendingApprovals[1]?.toolCallId).toBe("2");
    });
  });

  describe("removePendingApproval", () => {
    it("should remove approval by toolCallId", () => {
      const { addPendingApproval, removePendingApproval } = store.getState();

      addPendingApproval({
        toolCallId: "tool-1",
        toolName: "ReadFile",
        input: {},
        description: "Read file",
        riskLevel: "low",
        timestamp: Date.now(),
      });
      removePendingApproval("tool-1");

      const state = store.getState();
      expect(state.pendingApprovals).toHaveLength(0);
    });

    it("should only remove matching approval", () => {
      const { addPendingApproval, removePendingApproval } = store.getState();

      addPendingApproval({
        toolCallId: "1",
        toolName: "ReadFile",
        input: {},
        description: "Read",
        riskLevel: "low",
        timestamp: Date.now(),
      });
      addPendingApproval({
        toolCallId: "2",
        toolName: "WriteFile",
        input: {},
        description: "Write",
        riskLevel: "medium",
        timestamp: Date.now(),
      });
      addPendingApproval({
        toolCallId: "3",
        toolName: "DeleteFile",
        input: {},
        description: "Delete",
        riskLevel: "high",
        timestamp: Date.now(),
      });

      removePendingApproval("2");

      const state = store.getState();
      expect(state.pendingApprovals).toHaveLength(2);
      expect(
        state.pendingApprovals.find((a) => a.toolCallId === "1"),
      ).toBeDefined();
      expect(
        state.pendingApprovals.find((a) => a.toolCallId === "3"),
      ).toBeDefined();
      expect(
        state.pendingApprovals.find((a) => a.toolCallId === "2"),
      ).toBeUndefined();
    });

    it("should handle non-existent toolCallId gracefully", () => {
      const { addPendingApproval, removePendingApproval } = store.getState();

      addPendingApproval({
        toolCallId: "tool-1",
        toolName: "ReadFile",
        input: {},
        description: "Read",
        riskLevel: "low",
        timestamp: Date.now(),
      });
      removePendingApproval("non-existent");

      const state = store.getState();
      expect(state.pendingApprovals).toHaveLength(1);
    });
  });

  describe("addToolCall", () => {
    it("should add tool call", () => {
      const { addToolCall } = store.getState();

      addToolCall({
        id: "call-1",
        name: "ReadFile",
        input: { path: "test.ts" },
        status: "pending",
        timestamp: Date.now(),
      });

      const state = store.getState();
      expect(state.toolCalls).toHaveLength(1);
      expect(state.toolCalls[0]?.id).toBe("call-1");
      expect(state.toolCalls[0]?.status).toBe("pending");
    });

    it("should append multiple tool calls", () => {
      const { addToolCall } = store.getState();

      addToolCall({
        id: "1",
        name: "ReadFile",
        input: {},
        status: "pending",
        timestamp: 1000,
      });
      addToolCall({
        id: "2",
        name: "WriteFile",
        input: {},
        status: "success",
        timestamp: 2000,
      });

      const state = store.getState();
      expect(state.toolCalls).toHaveLength(2);
    });

    it("should include optional output field", () => {
      const { addToolCall } = store.getState();

      addToolCall({
        id: "call-1",
        name: "ReadFile",
        input: { path: "test.ts" },
        status: "success",
        timestamp: Date.now(),
        output: "file content",
      });

      const state = store.getState();
      expect(state.toolCalls[0]?.output).toBe("file content");
    });
  });

  describe("updateToolCall", () => {
    it("should update tool call status", () => {
      const { addToolCall, updateToolCall } = store.getState();

      addToolCall({
        id: "call-1",
        name: "ReadFile",
        input: {},
        status: "pending",
        timestamp: Date.now(),
      });

      updateToolCall("call-1", { status: "success", output: "result" });

      const state = store.getState();
      expect(state.toolCalls[0]?.status).toBe("success");
      expect(state.toolCalls[0]?.output).toBe("result");
    });

    it("should not modify if id not found", () => {
      const { addToolCall, updateToolCall } = store.getState();

      addToolCall({
        id: "call-1",
        name: "ReadFile",
        input: {},
        status: "pending",
        timestamp: Date.now(),
      });
      updateToolCall("non-existent", { status: "error" });

      const state = store.getState();
      expect(state.toolCalls[0]?.status).toBe("pending");
    });

    it("should preserve unmodified fields", () => {
      const { addToolCall, updateToolCall } = store.getState();

      const timestamp = Date.now();
      const input = { path: "test.ts" };

      addToolCall({
        id: "call-1",
        name: "ReadFile",
        input,
        status: "pending",
        timestamp,
      });

      updateToolCall("call-1", { status: "success" });

      const state = store.getState();
      expect(state.toolCalls[0]?.id).toBe("call-1");
      expect(state.toolCalls[0]?.name).toBe("ReadFile");
      expect(state.toolCalls[0]?.input).toEqual(input);
      expect(state.toolCalls[0]?.timestamp).toBe(timestamp);
    });
  });

  describe("clearToolCalls", () => {
    it("should remove all tool calls and pending approvals", () => {
      const { addToolCall, addPendingApproval, clearToolCalls } =
        store.getState();

      addToolCall({
        id: "1",
        name: "ReadFile",
        input: {},
        status: "completed",
      });
      addToolCall({
        id: "2",
        name: "WriteFile",
        input: {},
        status: "completed",
      });
      addPendingApproval({
        toolCallId: "approval-1",
        toolName: "DeleteFile",
        input: {},
        description: "Delete",
        riskLevel: "high",
        timestamp: Date.now(),
      });
      clearToolCalls();

      const state = store.getState();
      expect(state.toolCalls).toEqual([]);
      expect(state.pendingApprovals).toEqual([]);
    });
  });
});
