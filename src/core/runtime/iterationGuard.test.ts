/**
 * IterationGuard unit tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { IterationGuard } from "./iterationGuard";
import { RuntimeState } from "./runtimeState";
import { RuntimeEventEmitter } from "./runtimeEvents";
import type { ExecutionContext } from "../types";
import type { Logger } from "@/telemetry/logger";

describe("IterationGuard", () => {
  let guard: IterationGuard;
  let state: RuntimeState;
  let eventEmitter: RuntimeEventEmitter;
  let mockLogger: Logger;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {
      mode: "agent",
      workspaceRoot: "/test",
      openFiles: [],
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    eventEmitter = new RuntimeEventEmitter();
    guard = new IterationGuard(mockLogger, eventEmitter);
    state = new RuntimeState(mockContext, 25);
    state.startExecution(); // Initialize lastActivityTime
  });

  describe("max iterations check", () => {
    it("should allow execution under max iterations", () => {
      // Start at iteration 0, max 25
      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });

    it("should stop at max iterations (25)", () => {
      // Increment to 25
      for (let i = 0; i < 25; i++) {
        state.incrementIteration();
      }

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("max_iterations");
    });

    it("should stop beyond max iterations", () => {
      // Increment to 30
      for (let i = 0; i < 30; i++) {
        state.incrementIteration();
      }

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("max_iterations");
    });
  });

  describe("stall detection", () => {
    it("should not detect stall when activity is recent", () => {
      state.incrementIteration(); // Updates lastActivityTime

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });

    it("should detect stall after 30s without activity", () => {
      // Manually set lastActivityTime to 31s ago
      const execution = state.getExecution();
      const staleTime = Date.now() - 31000; // 31 seconds ago

      // We need to access private field or mock the state
      // For now, we'll test with real time manipulation
      vi.useFakeTimers();
      vi.setSystemTime(Date.now());

      state.incrementIteration(); // Set lastActivityTime to now

      // Advance time by 31 seconds
      vi.advanceTimersByTime(31000);

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("stalled");

      vi.useRealTimers();
    });

    it("should emit stall_detected event", () => {
      const events: Array<{ type: string }> = [];
      eventEmitter.onEvent((event) => events.push(event));

      vi.useFakeTimers();
      state.incrementIteration();
      vi.advanceTimersByTime(31000);

      guard.checkIteration(state);

      const stallEvent = events.find((e) => e.type === "stall_detected");
      expect(stallEvent).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe("duplicate tool detection", () => {
    it("should allow up to 5 calls of same tool", () => {
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });

    it("should stop after more than 5 calls of same tool", () => {
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile"); // 6th call

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("duplicate_tools");
    });

    it("should emit duplicate_tool_detected event", () => {
      const events: Array<{ type: string; toolName?: string; count?: number }> =
        [];
      eventEmitter.onEvent((event) => events.push(event));

      guard.recordToolCall("WriteFile");
      guard.recordToolCall("WriteFile");
      guard.recordToolCall("WriteFile");
      guard.recordToolCall("WriteFile");
      guard.recordToolCall("WriteFile");
      guard.recordToolCall("WriteFile");

      guard.checkIteration(state);

      const duplicateEvent = events.find(
        (e) => e.type === "duplicate_tool_detected",
      );
      expect(duplicateEvent).toBeDefined();
      expect(duplicateEvent?.toolName).toBe("WriteFile");
      expect(duplicateEvent?.count).toBe(6);
    });

    it("should track different tools independently", () => {
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("WriteFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("RunCommand");
      guard.recordToolCall("ReadFile");

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });

    it("should reset tool call counts", () => {
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile");
      guard.recordToolCall("ReadFile"); // 6 calls

      expect(guard.checkIteration(state).shouldStop).toBe(true);

      // Reset
      guard.reset();

      // Should allow new calls
      guard.recordToolCall("ReadFile");
      expect(guard.checkIteration(state).shouldStop).toBe(false);
    });
  });

  describe("no-progress detection", () => {
    it("should allow execution with progress", () => {
      guard.recordProgress({
        iteration: 1,
        modifiedFiles: 1,
        toolCallCount: 1,
        timestamp: Date.now(),
      });

      guard.recordProgress({
        iteration: 2,
        modifiedFiles: 2,
        toolCallCount: 2,
        timestamp: Date.now(),
      });

      guard.recordProgress({
        iteration: 3,
        modifiedFiles: 3,
        toolCallCount: 3,
        timestamp: Date.now(),
      });

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });

    it("should detect no-progress after 3 identical iterations", () => {
      // 3 iterations with same modified files and tool call count = no progress
      guard.recordProgress({
        iteration: 1,
        modifiedFiles: 5,
        toolCallCount: 10,
        timestamp: Date.now(),
      });

      guard.recordProgress({
        iteration: 2,
        modifiedFiles: 5,
        toolCallCount: 10,
        timestamp: Date.now(),
      });

      guard.recordProgress({
        iteration: 3,
        modifiedFiles: 5,
        toolCallCount: 10,
        timestamp: Date.now(),
      });

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("no_progress");
    });

    it("should emit loop_warning event on no-progress", () => {
      const events: Array<{ type: string }> = [];
      eventEmitter.onEvent((event) => events.push(event));

      guard.recordProgress({
        iteration: 1,
        modifiedFiles: 2,
        toolCallCount: 5,
        timestamp: Date.now(),
      });
      guard.recordProgress({
        iteration: 2,
        modifiedFiles: 2,
        toolCallCount: 5,
        timestamp: Date.now(),
      });
      guard.recordProgress({
        iteration: 3,
        modifiedFiles: 2,
        toolCallCount: 5,
        timestamp: Date.now(),
      });

      guard.checkIteration(state);

      const loopEvent = events.find((e) => e.type === "loop_warning");
      expect(loopEvent).toBeDefined();
    });

    it("should not detect no-progress with fewer than 3 markers", () => {
      guard.recordProgress({
        iteration: 1,
        modifiedFiles: 1,
        toolCallCount: 1,
        timestamp: Date.now(),
      });
      guard.recordProgress({
        iteration: 2,
        modifiedFiles: 1,
        toolCallCount: 2,
        timestamp: Date.now(),
      });

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe("guard priority", () => {
    it("should check max iterations first", () => {
      // Max iterations reached
      for (let i = 0; i < 25; i++) {
        state.incrementIteration();
      }

      // Also trigger duplicate tools
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");

      const result = guard.checkIteration(state);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("max_iterations"); // max_iterations takes precedence
    });
  });

  describe("reset", () => {
    it("should reset all counters and progress markers", () => {
      // Set up state that would trigger guards
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");
      guard.recordToolCall("Test");

      guard.recordProgress({
        iteration: 1,
        modifiedFiles: 1,
        toolCallCount: 1,
        timestamp: Date.now(),
      });
      guard.recordProgress({
        iteration: 2,
        modifiedFiles: 1,
        toolCallCount: 2,
        timestamp: Date.now(),
      });
      guard.recordProgress({
        iteration: 3,
        modifiedFiles: 1,
        toolCallCount: 3,
        timestamp: Date.now(),
      });

      // Would stop without reset
      expect(guard.checkIteration(state).shouldStop).toBe(true);

      // Reset
      guard.reset();

      // Should not stop after reset
      expect(guard.checkIteration(state).shouldStop).toBe(false);
    });
  });
});
