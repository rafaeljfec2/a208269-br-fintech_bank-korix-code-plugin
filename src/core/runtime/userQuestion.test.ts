/**
 * Tests for userQuestion utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  askUserQuestion,
  askSingleChoice,
  askMultipleChoice,
} from "./userQuestion";
import { RuntimeEventEmitter } from "./runtimeEvents";

describe("askUserQuestion", () => {
  let emitter: RuntimeEventEmitter;

  beforeEach(() => {
    emitter = new RuntimeEventEmitter();
  });

  describe("Validation", () => {
    it("should throw if title is empty", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "",
          question: "Test?",
          options: [
            { value: "a", label: "A", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
        }),
      ).rejects.toThrow("Question title is required");
    });

    it("should throw if question is empty", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "",
          options: [
            { value: "a", label: "A", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
        }),
      ).rejects.toThrow("Question text is required");
    });

    it("should throw if less than 2 options", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [{ value: "a", label: "A", description: "Option A" }],
        }),
      ).rejects.toThrow("At least 2 options are required");
    });

    it("should throw if more than 10 options", async () => {
      const options = Array.from({ length: 11 }, (_, i) => ({
        value: `${i}`,
        label: `Option ${i}`,
        description: `Description ${i}`,
      }));

      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options,
        }),
      ).rejects.toThrow("Maximum 10 options allowed");
    });

    it("should throw if timeout is less than 5 seconds", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [
            { value: "a", label: "A", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
          timeoutMs: 4000,
        }),
      ).rejects.toThrow("Timeout must be at least 5 seconds");
    });

    it("should throw if timeout is more than 5 minutes", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [
            { value: "a", label: "A", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
          timeoutMs: 400000,
        }),
      ).rejects.toThrow("Timeout must be at most 5 minutes");
    });

    it("should throw if option value is empty", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [
            { value: "", label: "A", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
        }),
      ).rejects.toThrow("Option value is required");
    });

    it("should throw if option label is empty", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [
            { value: "a", label: "", description: "Option A" },
            { value: "b", label: "B", description: "Option B" },
          ],
        }),
      ).rejects.toThrow("Option label is required");
    });

    it("should throw if option description is empty", async () => {
      await expect(
        askUserQuestion(emitter, {
          title: "Test",
          question: "Test?",
          options: [
            { value: "a", label: "A", description: "" },
            { value: "b", label: "B", description: "Option B" },
          ],
        }),
      ).rejects.toThrow("Option description is required");
    });
  });

  describe("Event Emission", () => {
    it("should emit user_question event with correct payload", async () => {
      const eventSpy = vi.fn();
      emitter.onEvent(eventSpy);

      const promise = askUserQuestion(emitter, {
        title: "Test Title",
        question: "Test Question?",
        mode: "single",
        options: [
          { value: "a", label: "Option A", description: "Description A" },
          { value: "b", label: "Option B", description: "Description B" },
        ],
        timeoutMs: 10000,
      });

      // Should emit user_question event
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "user_question",
          title: "Test Title",
          question: "Test Question?",
          mode: "single",
          options: [
            { value: "a", label: "Option A", description: "Description A" },
            { value: "b", label: "Option B", description: "Description B" },
          ],
          timeoutMs: 10000,
        }),
      );

      // Resolve promise to cleanup
      emitter.emitEvent({
        type: "user_answer",
        questionId: eventSpy.mock.calls[0][0].questionId,
        answers: ["a"],
        isTimeout: false,
        timestamp: Date.now(),
      });

      await promise;
    });

    it("should default mode to single", async () => {
      const eventSpy = vi.fn();
      emitter.onEvent(eventSpy);

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
      });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "single",
        }),
      );

      // Cleanup
      emitter.emitEvent({
        type: "user_answer",
        questionId: eventSpy.mock.calls[0][0].questionId,
        answers: ["a"],
        isTimeout: false,
        timestamp: Date.now(),
      });

      await promise;
    });
  });

  describe("Answer Handling", () => {
    it("should resolve promise when user_answer received", async () => {
      const eventSpy = vi.fn();
      emitter.onEvent(eventSpy);

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
      });

      const questionId = eventSpy.mock.calls[0][0].questionId;

      // Simulate user answer
      emitter.emitEvent({
        type: "user_answer",
        questionId,
        answers: ["a", "custom"],
        isTimeout: false,
        timestamp: Date.now(),
      });

      const result = await promise;
      expect(result).toEqual(["a", "custom"]);
    });

    it("should ignore answers for different question IDs", async () => {
      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
      });

      // Emit answer for different question
      emitter.emitEvent({
        type: "user_answer",
        questionId: "wrong-id",
        answers: ["wrong"],
        isTimeout: false,
        timestamp: Date.now(),
      });

      // Promise should not resolve
      const raceResult = await Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]);

      expect(raceResult).toBe("timeout");
    });
  });

  describe("Timeout Handling", () => {
    it("should resolve with default answer on timeout", async () => {
      vi.useFakeTimers();

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
        timeoutMs: 5000,
        defaultAnswer: "a",
      });

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result).toEqual(["a"]);

      vi.useRealTimers();
    });

    it("should emit user_answer with isTimeout:true on timeout", async () => {
      vi.useFakeTimers();

      const eventSpy = vi.fn();
      emitter.onEvent(eventSpy);

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
        timeoutMs: 5000,
        defaultAnswer: "a",
      });

      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      // Check if timeout event was emitted
      const timeoutEvent = eventSpy.mock.calls.find(
        (call) => call[0].type === "user_answer" && call[0].isTimeout === true,
      );

      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent[0].answers).toEqual(["a"]);

      vi.useRealTimers();
    });

    it("should handle array defaultAnswer", async () => {
      vi.useFakeTimers();

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
        timeoutMs: 5000,
        defaultAnswer: ["a", "b"],
      });

      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result).toEqual(["a", "b"]);

      vi.useRealTimers();
    });

    it("should use first option if no defaultAnswer", async () => {
      vi.useFakeTimers();

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "first", label: "First", description: "First option" },
          { value: "second", label: "Second", description: "Second option" },
        ],
        timeoutMs: 5000,
      });

      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result).toEqual(["first"]);

      vi.useRealTimers();
    });

    it("should apply 5-minute safety timeout when timeoutMs is undefined", async () => {
      vi.useFakeTimers();

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
        // No timeoutMs provided
      });

      // Fast-forward to 5 minutes (300000ms)
      await vi.advanceTimersByTimeAsync(300000);

      const result = await promise;
      // Should resolve with first option as default
      expect(result).toEqual(["a"]);

      vi.useRealTimers();
    });

    it("should prevent double-resolution when answer arrives during timeout", async () => {
      vi.useFakeTimers();

      const eventSpy = vi.fn();
      emitter.onEvent(eventSpy);

      const promise = askUserQuestion(emitter, {
        title: "Test",
        question: "Test?",
        options: [
          { value: "a", label: "A", description: "Option A" },
          { value: "b", label: "B", description: "Option B" },
        ],
        timeoutMs: 5000,
        defaultAnswer: "a",
      });

      const questionId = eventSpy.mock.calls[0][0].questionId;

      // Advance to just before timeout
      await vi.advanceTimersByTimeAsync(4900);

      // User answers just before timeout
      emitter.emitEvent({
        type: "user_answer",
        questionId,
        answers: ["b"],
        isTimeout: false,
        timestamp: Date.now(),
      });

      // Complete timeout
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      // Should resolve with user answer (b), not default (a)
      expect(result).toEqual(["b"]);

      vi.useRealTimers();
    });
  });
});

describe("askSingleChoice", () => {
  let emitter: RuntimeEventEmitter;

  beforeEach(() => {
    emitter = new RuntimeEventEmitter();
  });

  it("should return first answer from array", async () => {
    const eventSpy = vi.fn();
    emitter.onEvent(eventSpy);

    const promise = askSingleChoice(
      emitter,
      "Test",
      "Test?",
      [
        { value: "a", label: "A", description: "Option A" },
        { value: "b", label: "B", description: "Option B" },
      ],
    );

    const questionId = eventSpy.mock.calls[0][0].questionId;

    emitter.emitEvent({
      type: "user_answer",
      questionId,
      answers: ["selected", "other"],
      isTimeout: false,
      timestamp: Date.now(),
    });

    const result = await promise;
    expect(result).toBe("selected");
  });

  it("should set mode to single", async () => {
    const eventSpy = vi.fn();
    emitter.onEvent(eventSpy);

    const promise = askSingleChoice(
      emitter,
      "Test",
      "Test?",
      [
        { value: "a", label: "A", description: "Option A" },
        { value: "b", label: "B", description: "Option B" },
      ],
    );

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "single",
      }),
    );

    // Cleanup
    const questionId = eventSpy.mock.calls[0][0].questionId;
    emitter.emitEvent({
      type: "user_answer",
      questionId,
      answers: ["a"],
      isTimeout: false,
      timestamp: Date.now(),
    });

    await promise;
  });

  it("should return empty string if no answer", async () => {
    const eventSpy = vi.fn();
    emitter.onEvent(eventSpy);

    const promise = askSingleChoice(
      emitter,
      "Test",
      "Test?",
      [
        { value: "a", label: "A", description: "Option A" },
        { value: "b", label: "B", description: "Option B" },
      ],
    );

    const questionId = eventSpy.mock.calls[0][0].questionId;

    emitter.emitEvent({
      type: "user_answer",
      questionId,
      answers: [],
      isTimeout: false,
      timestamp: Date.now(),
    });

    const result = await promise;
    expect(result).toBe("");
  });
});

describe("askMultipleChoice", () => {
  let emitter: RuntimeEventEmitter;

  beforeEach(() => {
    emitter = new RuntimeEventEmitter();
  });

  it("should return full answers array", async () => {
    const eventSpy = vi.fn();
    emitter.onEvent(eventSpy);

    const promise = askMultipleChoice(
      emitter,
      "Test",
      "Test?",
      [
        { value: "a", label: "A", description: "Option A" },
        { value: "b", label: "B", description: "Option B" },
        { value: "c", label: "C", description: "Option C" },
      ],
    );

    const questionId = eventSpy.mock.calls[0][0].questionId;

    emitter.emitEvent({
      type: "user_answer",
      questionId,
      answers: ["a", "c", "custom text"],
      isTimeout: false,
      timestamp: Date.now(),
    });

    const result = await promise;
    expect(result).toEqual(["a", "c", "custom text"]);
  });

  it("should set mode to multiple", async () => {
    const eventSpy = vi.fn();
    emitter.onEvent(eventSpy);

    const promise = askMultipleChoice(
      emitter,
      "Test",
      "Test?",
      [
        { value: "a", label: "A", description: "Option A" },
        { value: "b", label: "B", description: "Option B" },
      ],
    );

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "multiple",
      }),
    );

    // Cleanup
    const questionId = eventSpy.mock.calls[0][0].questionId;
    emitter.emitEvent({
      type: "user_answer",
      questionId,
      answers: ["a"],
      isTimeout: false,
      timestamp: Date.now(),
    });

    await promise;
  });
});
