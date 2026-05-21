import { describe, expect, it } from "vitest";
import type { ExecutionCompleteEvent } from "../core/runtime/runtimeEvents";
import { buildChatParticipantCompletionMarkdown } from "./chatParticipantSupport";

function completionEvent(
  overrides: Partial<ExecutionCompleteEvent> = {},
): ExecutionCompleteEvent {
  return {
    type: "execution_complete",
    success: true,
    iterations: 2,
    metrics: {
      totalTokens: 123,
      totalToolCalls: 3,
      iterations: 2,
      duration: 1540,
      checkpoints: 0,
      recoveries: 0,
      toolBreakdown: {},
      eventTimeline: [],
    },
    timestamp: 1,
    ...overrides,
  };
}

describe("chatParticipantSupport", () => {
  it("should build a completion summary when tools ran without final text", () => {
    const summary = buildChatParticipantCompletionMarkdown({
      streamedText: "",
      toolCallCount: 3,
      failedToolCount: 0,
      completion: completionEvent(),
      cancelled: false,
    });

    expect(summary).toBe(
      "Concluído: 2 iterações, 3 ferramentas, 123 tokens em 1.5s.",
    );
  });

  it("should append a compact summary after streamed task output", () => {
    const summary = buildChatParticipantCompletionMarkdown({
      streamedText: "Arquivo criado.",
      toolCallCount: 1,
      failedToolCount: 0,
      completion: completionEvent({
        iterations: 1,
        metrics: {
          totalTokens: 42,
          totalToolCalls: 1,
          iterations: 1,
          duration: 900,
          checkpoints: 0,
          recoveries: 0,
          toolBreakdown: {},
          eventTimeline: [],
        },
      }),
      cancelled: false,
    });

    expect(summary).toBe(
      "\n\nConcluído: 1 iteração, 1 ferramenta, 42 tokens em 0.9s.",
    );
  });

  it("should skip summaries for direct answers without runtime activity", () => {
    const summary = buildChatParticipantCompletionMarkdown({
      streamedText: "Async/await simplifica Promises.",
      toolCallCount: 0,
      failedToolCount: 0,
      cancelled: false,
    });

    expect(summary).toBeNull();
  });
});
