import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  ProviderEvent,
  ProviderInput,
  ProviderMetadata,
  RequestContext,
} from "../providers/types";
import type { ExecutionContext } from "../types";
import { Logger } from "../../telemetry/logger";
import { DirectLlmExecutor } from "./DirectLlmExecutor";
import { RuntimeEventEmitter } from "./runtimeEvents";
import type { RuntimeEvent } from "./runtimeEvents";

describe("DirectLlmExecutor", () => {
  it("should call the provider with no tools and emit direct runtime events", async () => {
    let capturedInput: ProviderInput | undefined;
    const provider: AIProvider = {
      type: "test",
      config: {
        type: "test",
        apiKey: "key",
        model: "test-model",
      },
      async *send(
        input: ProviderInput,
        context: RequestContext,
      ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
        capturedInput = input;
        yield {
          type: "token",
          value: "Olá",
          timestamp: 10,
          correlation: {
            correlationId: context.correlationId,
            sessionId: context.sessionId,
            agentRunId: context.agentRunId,
            iterationId: context.iterationId,
          },
        };
        yield {
          type: "finish",
          reason: "end_turn",
          timestamp: 12,
          correlation: {
            correlationId: context.correlationId,
            sessionId: context.sessionId,
            agentRunId: context.agentRunId,
            iterationId: context.iterationId,
          },
        };

        return {
          model: "test-model",
          totalDuration: 2,
          usage: {
            inputTokens: 4,
            outputTokens: 1,
          },
        };
      },
      dispose: async () => {},
    };
    const eventEmitter = new RuntimeEventEmitter();
    const events: RuntimeEvent[] = [];
    eventEmitter.onEvent((event) => events.push(event));
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/repo",
      openFiles: [],
    };

    await new DirectLlmExecutor(
      provider,
      eventEmitter,
      new Logger({ level: "error" }),
    ).run({
      initialMessage: "ola",
      previousMessages: [],
      context,
      systemPrompt: "compact prompt",
      maxTokens: 512,
    });

    expect(capturedInput).toMatchObject({
      toolChoice: "none",
      maxTokens: 512,
      system: "compact prompt",
    });
    expect(capturedInput?.tools).toBeUndefined();
    expect(capturedInput?.messages).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual([
      "provider_request_start",
      "provider_first_output",
      "token",
      "provider_request_end",
      "done",
      "execution_complete",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "token",
        content: "Olá",
      }),
    );
  });
});
