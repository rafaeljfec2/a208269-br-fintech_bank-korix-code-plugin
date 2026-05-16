/**
 * SSE (Server-Sent Events) incremental parser
 * Stateless, backpressure-aware, handles fragmentation
 */

import type { SSEEvent, AnthropicStreamEvent } from "./litellmTypes";
import { LiteLLMStreamingError } from "./litellmErrors";

/**
 * SSE Parser - incremental, stateless
 * Parseia o formato SSE (Server-Sent Events) genérico
 */
export class SSEParser {
  private buffer = "";

  /**
   * Parse chunks incrementalmente
   * Retorna eventos completos e mantém fragmentos incompletos no buffer
   */
  *parse(chunk: string): Generator<SSEEvent, void, void> {
    this.buffer += chunk;

    // SSE events são delimitados por \n\n ou \r\n\r\n
    const lines = this.buffer.split(/\r?\n\r?\n/);

    // Último elemento pode ser evento incompleto
    this.buffer = lines.pop() ?? "";

    for (const eventBlock of lines) {
      if (eventBlock.trim() === "") {
        continue;
      }

      const event = this.parseEvent(eventBlock);
      if (event) {
        yield event;
      }
    }
  }

  /**
   * Parse um bloco de evento SSE
   */
  private parseEvent(block: string): SSEEvent | null {
    const lines = block.split(/\r?\n/);
    let event: string | undefined;
    const data: string[] = [];
    let id: string | undefined;
    let retry: number | undefined;

    for (const line of lines) {
      // Skip comments
      if (line.startsWith(":")) {
        continue;
      }

      // Parse field
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) {
        continue;
      }

      const field = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).trimStart();

      switch (field) {
        case "event":
          event = value;
          break;
        case "data":
          data.push(value);
          break;
        case "id":
          id = value;
          break;
        case "retry":
          retry = parseInt(value, 10);
          break;
      }
    }

    // Data field é obrigatório
    if (data.length === 0) {
      return null;
    }

    return {
      event,
      data: data.join("\n"),
      id,
      retry,
    };
  }

  /**
   * Get remaining buffer (para debugging)
   */
  getRemainingBuffer(): string {
    return this.buffer;
  }

  /**
   * Reset buffer
   */
  reset(): void {
    this.buffer = "";
  }
}

/**
 * Parse Anthropic stream event data
 * Anthropic Messages API streaming events (SSE format)
 */
export function parseStreamChunk(data: string): AnthropicStreamEvent | null {
  // Anthropic não usa [DONE] marker, apenas fecha a stream
  // Eventos vazios ou inválidos retornam null
  const trimmed = data.trim();
  if (trimmed === "" || trimmed === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as AnthropicStreamEvent;
  } catch (error) {
    throw new LiteLLMStreamingError(
      `Failed to parse Anthropic stream event: ${data.substring(0, 100)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Backpressure buffer para SSE streaming
 */
export class BackpressureBuffer {
  private queue: Uint8Array[] = [];
  private readonly maxSize: number;
  private readonly slowConsumerThreshold: number;

  constructor(maxSize = 1000, slowConsumerThreshold = 500) {
    this.maxSize = maxSize;
    this.slowConsumerThreshold = slowConsumerThreshold;
  }

  async write(chunk: Uint8Array): Promise<void> {
    // Check backpressure
    if (this.queue.length >= this.maxSize) {
      // Wait for queue to drain
      await this.waitForDrain();
    }

    this.queue.push(chunk);

    // Emit warning se consumer lento
    if (this.queue.length > this.slowConsumerThreshold) {
      // Logger externo deveria escutar isso
      console.warn("Slow consumer detected", {
        queueSize: this.queue.length,
        threshold: this.slowConsumerThreshold,
      });
    }
  }

  read(): Uint8Array | undefined {
    return this.queue.shift();
  }

  readAll(): Uint8Array[] {
    const all = [...this.queue];
    this.queue = [];
    return all;
  }

  get size(): number {
    return this.queue.length;
  }

  private async waitForDrain(): Promise<void> {
    // Simplificado: aguarda um pequeno delay
    // Em produção, usaria event-driven wait
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
