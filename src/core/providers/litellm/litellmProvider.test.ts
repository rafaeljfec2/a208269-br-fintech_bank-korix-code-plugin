import { describe, expect, it } from "vitest";
import type {
  Transport,
  TransportRequestOptions,
} from "../transport/httpTransport";
import { LiteLLMProvider } from "./litellmProvider";

describe("LiteLLMProvider", () => {
  it("should use OpenAI chat completions for OpenAI models", async () => {
    const bodies: string[] = [];
    const urls: string[] = [];
    const transport = createTransport(bodies, urls, createOpenAISseStream);
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "openai/gpt-5.5",
      },
      transport,
    );

    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "qual é o modelo de llm",
            timestamp: Date.now(),
          },
        ],
        toolChoice: "none",
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
      readonly model?: string;
      readonly messages?: readonly { readonly role: string }[];
      readonly max_tokens?: number;
      readonly max_completion_tokens?: number;
      readonly tool_choice?: unknown;
      readonly temperature?: number;
    };

    expect(urls[0]).toBe(
      "https://litellm.int.thomsonreuters.com/v1/chat/completions",
    );
    expect(body.model).toBe("openai/gpt-5.5");
    expect(body.messages?.[0]?.role).toBe("user");
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(8192);
    expect(body.tool_choice).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it("should keep legacy OpenAI chat params for GPT-4 models", async () => {
    const bodies: string[] = [];
    const transport = createTransport(bodies, [], createOpenAISseStream);
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "openai/gpt-4",
        temperature: 0.2,
      },
      transport,
    );

    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "qual é o modelo de llm",
            timestamp: Date.now(),
          },
        ],
        maxTokens: 2048,
        toolChoice: "none",
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
      readonly max_tokens?: number;
      readonly max_completion_tokens?: number;
      readonly temperature?: number;
    };

    expect(body.max_tokens).toBe(2048);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.2);
  });

  it("should treat OpenAI DONE marker as a normal stream ending", async () => {
    const bodies: string[] = [];
    const transport = createTransport(
      bodies,
      [],
      createOpenAISseStreamTerminatedAfterDone,
    );
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "openai/gpt-5.5",
      },
      transport,
    );

    const events = [];
    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "me fale sobre a llm",
            timestamp: Date.now(),
          },
        ],
        toolChoice: "none",
      },
      {
        correlationId: "correlation",
        sessionId: "session",
      },
    );

    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "token",
        value: "Olá",
      }),
    );
  });

  it("should treat OpenAI stream termination after finish as a normal ending", async () => {
    const bodies: string[] = [];
    const transport = createTransport(
      bodies,
      [],
      createOpenAISseStreamTerminatedAfterFinish,
    );
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "openai/gpt-5.5",
      },
      transport,
    );

    const events = [];
    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "me fale sobre a llm",
            timestamp: Date.now(),
          },
        ],
        toolChoice: "none",
      },
      {
        correlationId: "correlation",
        sessionId: "session",
      },
    );

    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "finish",
        reason: "stop",
      }),
    );
  });

  it("should serialize OpenAI tools using function schema", async () => {
    const bodies: string[] = [];
    const transport = createTransport(bodies, [], createOpenAISseStream);
    const provider = new LiteLLMProvider(
      {
        type: "litellm",
        apiKey: "test",
        model: "openai/gpt-5.5",
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
      readonly tools?: readonly {
        readonly type?: string;
        readonly function?: {
          readonly name?: string;
          readonly parameters?: {
            readonly required?: readonly string[];
          };
        };
      }[];
      readonly tool_choice?: string;
    };

    expect(body.tools?.[0]?.type).toBe("function");
    expect(body.tools?.[0]?.function?.name).toBe("ReadFile");
    expect(body.tools?.[0]?.function?.parameters?.required).toEqual(["path"]);
    expect(body.tool_choice).toBe("required");
  });

  it("should omit tool choice when tools are disabled", async () => {
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
            content: "qual é o modelo de llm",
            timestamp: Date.now(),
          },
        ],
        toolChoice: "none",
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
      readonly tool_choice?: unknown;
    };

    expect(body.tool_choice).toBeUndefined();
  });

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

function createTransport(
  bodies: string[],
  urls: string[] = [],
  streamFactory: () => ReadableStream<Uint8Array> = createSseStream,
): Transport {
  return {
    async request(
      url: string,
      options: TransportRequestOptions,
    ): Promise<Response> {
      urls.push(url);
      bodies.push(options.body ?? "");

      return new Response(streamFactory(), {
        status: 200,
        statusText: "OK",
      });
    },
  };
}

function createOpenAISseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = [
    {
      choices: [
        {
          index: 0,
          delta: { content: "Olá" },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
      },
    },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${payload}data: [DONE]\n\n`));
      controller.close();
    },
  });
}

function createOpenAISseStreamTerminatedAfterDone(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pulled = false;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled) {
        controller.error(new TypeError("terminated"));
        return;
      }

      pulled = true;
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [
              {
                index: 0,
                delta: { content: "Olá" },
                finish_reason: null,
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
        ),
      );
    },
  });
}

function createOpenAISseStreamTerminatedAfterFinish(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pulled = false;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled) {
        controller.error(new TypeError("terminated"));
        return;
      }

      pulled = true;
      controller.enqueue(
        encoder.encode(
          [
            {
              choices: [
                {
                  index: 0,
                  delta: { content: "Olá" },
                  finish_reason: null,
                },
              ],
            },
            {
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
        ),
      );
    },
  });
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
