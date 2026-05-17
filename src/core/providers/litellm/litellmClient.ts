/**
 * LiteLLM HTTP Client
 *
 * IMPORTANTE: Usa Anthropic Messages API format (/v1/messages)
 * Requer: Authorization Bearer, User-Agent, anthropic-version header
 */

import type { Transport } from "../transport/httpTransport";
import type {
  AnthropicMessagesRequest,
  AnthropicStreamEvent,
} from "./litellmTypes";
import type { CorrelationContext } from "../types";
import { SSEParser, parseStreamChunk } from "./litellmParser";
import { detectBudgetError } from "./litellmErrors";

// User-Agent usado pelo Axiom Agents (funciona com LiteLLM TR)
const CLAUDE_PROXY_USER_AGENT = "claude-cli/2.1.78 (external, sdk-cli)";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * LiteLLM Client - stateless HTTP client
 */
export class LiteLLMClient {
  private readonly parser = new SSEParser();

  constructor(
    private readonly apiBase: string,
    private readonly transport: Transport,
  ) {
    // Validate no trailing slash
    if (this.apiBase.endsWith("/")) {
      throw new Error("apiBase must not have trailing slash");
    }
  }

  /**
   * Stream Anthropic Messages
   * Retorna AsyncGenerator de Anthropic stream events
   */
  async *streamMessages(
    request: AnthropicMessagesRequest,
    _correlation: CorrelationContext,
    signal?: AbortSignal,
  ): AsyncGenerator<AnthropicStreamEvent, void, void> {
    const url = `${this.apiBase}/v1/messages`;

    const response = await this.transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "User-Agent": CLAUDE_PROXY_USER_AGENT,
          // Authorization Bearer é injetado pelo AuthTransport
        },
        body: JSON.stringify({ ...request, stream: true }),
      },
      signal,
    );

    // Check for budget error (400 + specific message)
    const budgetError = await detectBudgetError(response);
    if (budgetError) {
      throw budgetError;
    }

    // Check response OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LiteLLM request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    // Check SSE stream
    if (!response.body) {
      throw new Error("No response body");
    }

    // Parse SSE stream
    yield* this.parseSSEStream(response.body, signal);
  }

  /**
   * Parse SSE stream incrementalmente (Anthropic format)
   */
  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncGenerator<AnthropicStreamEvent, void, void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    this.parser.reset();

    try {
      while (true) {
        // Check cancellation
        if (signal?.aborted) {
          await reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk
        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE events
        for (const event of this.parser.parse(chunk)) {
          // Parse data field como JSON
          const streamEvent = parseStreamChunk(event.data);

          // Ignora eventos vazios ou [DONE]
          if (!streamEvent) {
            continue;
          }

          yield streamEvent;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
