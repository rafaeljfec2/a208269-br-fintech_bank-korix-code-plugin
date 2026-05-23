import { describe, expect, it, vi } from "vitest";
import { LiteLLMNormalizer } from "./litellmNormalizer";
import type { CorrelationContext } from "../types";

const correlation: CorrelationContext = {
  correlationId: "correlation-test",
  sessionId: "session-test",
  agentRunId: "agent-test",
  iterationId: 1,
};

describe("LiteLLMNormalizer", () => {
  it("should emit an empty object for no-argument tool calls", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const normalizer = new LiteLLMNormalizer();

    normalizer.normalize(
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_status",
          name: "GitStatus",
        },
      },
      correlation,
    );

    const events = normalizer.normalize(
      {
        type: "content_block_stop",
        index: 0,
      },
      correlation,
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_call_complete",
        id: "toolu_status",
        name: "GitStatus",
        arguments: "{}",
      }),
    ]);
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
