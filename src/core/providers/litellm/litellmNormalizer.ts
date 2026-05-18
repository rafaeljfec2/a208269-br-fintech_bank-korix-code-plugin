/**
 * LiteLLM Normalizer - converte Anthropic stream events para ProviderEvents
 *
 * IMPORTANTE: LiteLLM TR usa Anthropic Messages API format, NÃO OpenAI format!
 */

import type {
  AnthropicStreamEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  MessageDeltaEvent,
} from "./litellmTypes";
import type { ProviderEvent, CorrelationContext } from "../types";
import { ProviderError } from "../types";
import { normalizeFinishReason } from "../normalization";

/**
 * LiteLLM Event Normalizer
 * Converte Anthropic Messages API streaming events para ProviderEvents canônicos
 *
 * Anthropic stream events:
 * - message_start: início com metadados e usage inicial
 * - content_block_start: início de text ou tool_use block
 * - content_block_delta: deltas incrementais (text_delta ou input_json_delta)
 * - content_block_stop: fim do bloco
 * - message_delta: stop_reason e usage final
 * - message_stop: fim da stream
 * - ping: keep-alive (ignorado)
 * - error: erro
 */
export class LiteLLMNormalizer {
  // Tool call assembly state
  private currentToolCall: {
    id: string;
    name: string;
    jsonChunks: string[];
    index: number; // Track index for tool_call_complete event
  } | null = null;
  /**
   * Normalize Anthropic stream event para ProviderEvent(s)
   * Pode retornar múltiplos eventos (ex: usage + token)
   */
  normalize(
    event: AnthropicStreamEvent,
    correlation: CorrelationContext,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];
    const timestamp = Date.now();

    // DEBUG: Log EVERY event from LiteLLM
    console.log("[LiteLLMNormalizer] Received event:", event.type, JSON.stringify(event).substring(0, 200));

    switch (event.type) {
      case "message_start":
        // Emite usage inicial (input tokens)
        events.push(
          ...this.normalizeMessageStart(event, correlation, timestamp),
        );
        break;

      case "content_block_start":
        // Início de um content block (text ou tool_use)
        // Tool_use: emite tool_call_delta com id e name
        events.push(
          ...this.normalizeContentBlockStart(event, correlation, timestamp),
        );
        break;

      case "content_block_delta":
        // Delta incremental (text ou JSON de tool input)
        events.push(
          ...this.normalizeContentBlockDelta(event, correlation, timestamp),
        );
        break;

      case "content_block_stop":
        // Fim do bloco - emitir tool_call_complete se for tool call
        if (this.currentToolCall) {
          const fullJson = this.currentToolCall.jsonChunks.join("");
          events.push({
            type: "tool_call_complete",
            index: this.currentToolCall.index, // FIX: Add required index field
            id: this.currentToolCall.id,
            name: this.currentToolCall.name,
            arguments: fullJson,
            timestamp,
            correlation,
          });
          this.currentToolCall = null; // Reset
        }
        break;

      case "message_delta":
        // Stop reason e usage final (output tokens)
        events.push(
          ...this.normalizeMessageDelta(event, correlation, timestamp),
        );
        break;

      case "message_stop":
        // Fim da stream - não gera evento adicional (finish já veio no message_delta)
        break;

      case "ping":
        // Keep-alive, ignorar
        break;

      case "error":
        // Erro da API
        events.push({
          type: "error",
          error: new ProviderError(event.error.message, event.error.type),
          timestamp,
          correlation,
        });
        break;
    }

    return events;
  }

  private normalizeMessageStart(
    event: MessageStartEvent,
    correlation: CorrelationContext,
    timestamp: number,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];

    // Usage inicial (input tokens)
    if (event.message.usage) {
      events.push({
        type: "usage",
        inputTokens: event.message.usage.input_tokens,
        outputTokens: 0, // Output vem no message_delta
        timestamp,
        correlation,
      });
    }

    return events;
  }

  private normalizeContentBlockStart(
    event: ContentBlockStartEvent,
    correlation: CorrelationContext,
    timestamp: number,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];
    const block = event.content_block;

    // Text block: não gera evento (conteúdo vem nos deltas)
    if (block.type === "text") {
      return events;
    }

    // Tool use block: inicializa acumulador de JSON
    if (block.type === "tool_use") {
      this.currentToolCall = {
        id: block.id,
        name: block.name,
        jsonChunks: [],
        index: event.index ?? 0, // Capture index from event, default to 0 for single tool calls
      };
    }

    return events;
  }

  private normalizeContentBlockDelta(
    event: ContentBlockDeltaEvent,
    correlation: CorrelationContext,
    timestamp: number,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];
    const delta = event.delta;

    // Text delta
    if (delta.type === "text_delta" && delta.text) {
      // Thinking: Anthropic emite thinking em content blocks especiais
      // Por ora, tratamos como token normal
      // TODO: detectar thinking blocks se necessário
      events.push({
        type: "token",
        value: delta.text,
        timestamp,
        correlation,
      });
    }

    // Tool input JSON delta - acumular chunks
    if (delta.type === "input_json_delta" && delta.partial_json && this.currentToolCall) {
      this.currentToolCall.jsonChunks.push(delta.partial_json);
    }

    return events;
  }

  private normalizeMessageDelta(
    event: MessageDeltaEvent,
    correlation: CorrelationContext,
    timestamp: number,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];

    // Finish reason
    if (event.delta.stop_reason) {
      const reason = normalizeFinishReason(event.delta.stop_reason);
      events.push({
        type: "finish",
        reason,
        timestamp,
        correlation,
      });
    }

    // Usage final (output tokens)
    if (event.usage) {
      events.push({
        type: "usage",
        inputTokens: 0, // Input já veio no message_start
        outputTokens: event.usage.output_tokens,
        timestamp,
        correlation,
      });
    }

    return events;
  }
}
