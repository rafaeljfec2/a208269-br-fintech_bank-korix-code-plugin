/**
 * Core provider types - event-driven, stateless architecture
 * Provider emite ProviderEvents puros (vendor-agnostic)
 * Runtime transforma ProviderEvents em RuntimeEvents
 */

import type { Message } from "../types";
import type { ToolDefinition } from "../../providers/types";

// Re-export for provider implementations
export type { ToolDefinition };

/**
 * Correlation context para tracing distribuído
 * OBRIGATÓRIO em todos eventos e logs
 */
export interface CorrelationContext {
  readonly correlationId: string; // UUID único por request
  readonly sessionId: string; // VSCode session ID
  readonly agentRunId?: string; // AgentLoop run ID
  readonly iterationId?: number; // Iteration number
  readonly requestId?: string; // Provider request ID (se disponível)
}

/**
 * Provider event types - eventos puros emitidos por providers
 * Provider NÃO mantém estado - apenas emite eventos incrementais
 */
export type ProviderEvent =
  | TokenEvent
  | ThinkingEvent
  | ToolCallDeltaEvent
  | ToolCallCompleteEvent
  | UsageEvent
  | FinishEvent
  | ErrorEvent;

export interface TokenEvent {
  readonly type: "token";
  readonly value: string;
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

export interface ThinkingEvent {
  readonly type: "thinking";
  readonly value: string;
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

/**
 * Tool call delta - fragmento de tool call durante streaming
 * Acumulação de deltas acontece em ToolCallAssembler (runtime layer)
 */
export interface ToolCallDeltaEvent {
  readonly type: "tool_call_delta";
  readonly index: number; // Tool call index no array (OpenAI streaming)
  readonly id?: string; // Tool call ID (pode vir no primeiro delta)
  readonly name?: string; // Tool name (pode vir no primeiro delta)
  readonly argumentsChunk?: string; // Fragmento de JSON arguments
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

/**
 * Tool call completo - provider finalizou reconstrução
 * (Alguns vendors podem emitir completo ao invés de deltas)
 */
export interface ToolCallCompleteEvent {
  readonly type: "tool_call_complete";
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly arguments: string; // JSON string completo
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

export interface UsageEvent {
  readonly type: "usage";
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

/**
 * Finish event - streaming completou
 * Reason é normalizado pelo normalization layer
 */
export interface FinishEvent {
  readonly type: "finish";
  readonly reason: string; // Normalizado: "stop", "max_tokens", "tool_calls", "error"
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

export interface ErrorEvent {
  readonly type: "error";
  readonly error: ProviderError;
  readonly timestamp: number;
  readonly correlation: CorrelationContext;
}

/**
 * Provider metadata - retornado ao final do streaming
 */
export interface ProviderMetadata {
  readonly model: string;
  readonly requestId?: string;
  readonly totalDuration: number;
  readonly usage?: TokenUsage;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

/**
 * Request context - metadata de execução
 */
export interface RequestContext {
  readonly correlationId: string;
  readonly sessionId: string;
  readonly agentRunId?: string;
  readonly iterationId?: number;
  readonly signal?: AbortSignal;
}

/**
 * Provider input - dados enviados ao provider
 */
export interface ProviderInput {
  readonly messages: readonly Message[];
  readonly tools?: readonly ToolDefinition[];
  readonly toolChoice?:
    | "none"
    | "auto"
    | "required"
    | {
        readonly type: "tool";
        readonly name: string;
      };
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/**
 * AIProvider interface - STATELESS provider contract
 * Provider NÃO mantém conversação, tool calls, ou qualquer estado agentic
 */
export interface AIProvider {
  readonly type: string;
  readonly config: ProviderConfig;

  /**
   * Envia request e streama ProviderEvents puros
   * Provider é STATELESS - não mantém tool calls, buffers, etc
   *
   * @returns AsyncGenerator que yielda ProviderEvents e retorna ProviderMetadata
   */
  send(
    input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void>;

  /**
   * Cleanup provider resources
   */
  dispose(): Promise<void>;
}

export interface ProviderConfig {
  readonly type: string;
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/**
 * Provider factory interface
 */
export interface ProviderFactory {
  create(config: ProviderConfig): AIProvider;
  supports(type: string): boolean;
}

/**
 * Base provider error
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
