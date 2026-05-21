import { describe, expect, it } from "vitest";
import type {
  Transport,
  TransportRequestOptions,
} from "../transport/httpTransport";
import { LiteLLMProvider } from "./litellmProvider";

describe("LiteLLMProvider", () => {
  it("should serialize required tool choice as Anthropic any", async () => {
    const bodies: string[] = [];
    const transport = createTransport(bodies);
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "anthropic/claude-sonnet-4-6",
      },
      transport,
    );

    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "leia um arquivo",
            timestamp: Date.now(),
          },
        ],
        tools: [
          {
            name: "ReadFile",
            description: "Read a file.",
            input_schema: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
              required: ["path"],
            },
          },
        ],
        toolChoice: "required",
      },
      {
        correlationId: "correlation",
        sessionId: "session",
      },
    );

    for await (const _event of stream) {
      // Drain stream to force request construction.
    }

    const body = JSON.parse(bodies[0] ?? "{}") as {
      readonly tool_choice?: { readonly type?: string };
    };

    expect(body.tool_choice).toEqual({ type: "any" });
  });

  it("should serialize a forced tool choice by name", async () => {
    const bodies: string[] = [];
    const transport = createTransport(bodies);
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "anthropic/claude-sonnet-4-6",
      },
      transport,
    );

    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "leia um arquivo",
            timestamp: Date.now(),
          },
        ],
        tools: [
          {
            name: "ReadFile",
            description: "Read a file.",
            input_schema: {
              type: "object",
              properties: {},
            },
          },
        ],
        toolChoice: {
          type: "tool",
          name: "ReadFile",
        },
      },
      {
        correlationId: "correlation",
        sessionId: "session",
      },
    );

    for await (const _event of stream) {
      // Drain stream to force request construction.
    }

    const body = JSON.parse(bodies[0] ?? "{}") as {
      readonly tool_choice?: {
        readonly type?: string;
        readonly name?: string;
      };
    };

    expect(body.tool_choice).toEqual({ type: "tool", name: "ReadFile" });
  });
});

function createTransport(bodies: string[]): Transport {
  return {
    async request(
      _url: string,
      options: TransportRequestOptions,
    ): Promise<Response> {
      bodies.push(options.body ?? "");

      return new Response(createSseStream(), {
        status: 200,
        statusText: "OK",
      });
    },
  };
}

function createSseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude",
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 0,
        },
      },
    },
    {
      type: "message_delta",
      delta: {
        stop_reason: "end_turn",
        stop_sequence: null,
      },
      usage: {
        output_tokens: 1,
      },
    },
    {
      type: "message_stop",
    },
  ];
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}
