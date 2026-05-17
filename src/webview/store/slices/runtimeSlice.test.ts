/**
 * Runtime slice tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createRuntimeSlice, type RuntimeSlice } from "./runtimeSlice";

describe("runtimeSlice", () => {
  let store: ReturnType<typeof create<RuntimeSlice>>;

  beforeEach(() => {
    store = create<RuntimeSlice>(createRuntimeSlice);
  });

  describe("initial state", () => {
    it("should initialize with default values", () => {
      const state = store.getState();

      expect(state.isExecuting).toBe(false);
      expect(state.currentIteration).toBe(0);
      expect(state.metrics).toEqual({
        tokenCount: 0,
        toolCallCount: 0,
        iterationCount: 0,
      });
      expect(state.mode).toBe("agent");
      expect(state.model).toBe("claude-opus-4-7");
    });
  });

  describe("setExecuting", () => {
    it("should set executing state to true", () => {
      const { setExecuting } = store.getState();

      setExecuting(true);

      const state = store.getState();
      expect(state.isExecuting).toBe(true);
    });

    it("should set executing state to false", () => {
      const { setExecuting } = store.getState();

      setExecuting(true);
      setExecuting(false);

      const state = store.getState();
      expect(state.isExecuting).toBe(false);
    });
  });

  describe("setIteration", () => {
    it("should set iteration number", () => {
      const { setIteration } = store.getState();

      setIteration(5);

      const state = store.getState();
      expect(state.currentIteration).toBe(5);
    });

    it("should allow multiple updates", () => {
      const { setIteration } = store.getState();

      setIteration(1);
      setIteration(2);
      setIteration(3);

      const state = store.getState();
      expect(state.currentIteration).toBe(3);
    });
  });

  describe("updateMetrics", () => {
    it("should update token count", () => {
      const { updateMetrics } = store.getState();

      updateMetrics({ tokenCount: 150 });

      const state = store.getState();
      expect(state.metrics.tokenCount).toBe(150);
    });

    it("should update tool call count", () => {
      const { updateMetrics } = store.getState();

      updateMetrics({ toolCallCount: 5 });

      const state = store.getState();
      expect(state.metrics.toolCallCount).toBe(5);
    });

    it("should update iteration count", () => {
      const { updateMetrics } = store.getState();

      updateMetrics({ iterationCount: 3 });

      const state = store.getState();
      expect(state.metrics.iterationCount).toBe(3);
    });

    it("should allow partial updates", () => {
      const { updateMetrics } = store.getState();

      updateMetrics({ tokenCount: 100 });
      updateMetrics({ toolCallCount: 2 });
      updateMetrics({ iterationCount: 1 });

      const state = store.getState();
      expect(state.metrics.tokenCount).toBe(100);
      expect(state.metrics.toolCallCount).toBe(2);
      expect(state.metrics.iterationCount).toBe(1);
    });

    it("should merge with existing metrics", () => {
      const { updateMetrics } = store.getState();

      updateMetrics({ tokenCount: 50, toolCallCount: 1 });
      updateMetrics({ tokenCount: 100 }); // Only update tokenCount

      const state = store.getState();
      expect(state.metrics.tokenCount).toBe(100);
      expect(state.metrics.toolCallCount).toBe(1); // Should remain unchanged
    });
  });

  describe("setMode", () => {
    it("should set mode to ask", () => {
      const { setMode } = store.getState();

      setMode("ask");

      const state = store.getState();
      expect(state.mode).toBe("ask");
    });

    it("should set mode to plan", () => {
      const { setMode } = store.getState();

      setMode("plan");

      const state = store.getState();
      expect(state.mode).toBe("plan");
    });

    it("should set mode to agent", () => {
      const { setMode } = store.getState();

      setMode("agent");

      const state = store.getState();
      expect(state.mode).toBe("agent");
    });
  });

  describe("setModel", () => {
    it("should set model", () => {
      const { setModel } = store.getState();

      setModel("claude-sonnet-4-6");

      const state = store.getState();
      expect(state.model).toBe("claude-sonnet-4-6");
    });

    it("should allow model changes", () => {
      const { setModel } = store.getState();

      setModel("claude-sonnet-4-6");
      setModel("claude-haiku-4-5");

      const state = store.getState();
      expect(state.model).toBe("claude-haiku-4-5");
    });
  });
});
