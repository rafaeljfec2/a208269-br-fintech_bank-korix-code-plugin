/**
 * LiteLLM-specific types (Anthropic Messages API format)
 *
 * IMPORTANTE: LiteLLM TR usa Anthropic Messages API (/v1/messages), NÃO OpenAI format!
 * Requer: Authorization Bearer, User-Agent específico, anthropic-version header
 */

/**
 * LiteLLM configuration
 */
export interface LiteLLMConfig {
  readonly apiBase: string; // https://litellm.int.thomsonreuters.com (NO trailing slash!)
  readonly apiKey: string;
  readonly model: string; // anthropic/claude-sonnet-4-6 (vendor prefix REQUIRED)
  readonly timeoutMs: number;
  readonly retryPolicy: RetryPolicy;
  readonly circuitBreakerPolicy: CircuitBreakerPolicy;
  readonly enablePromptCaching: boolean;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelay: number; // ms
  readonly maxDelay: number; // ms
  readonly retryableStatuses: readonly number[];
}

/**
 * Circuit breaker policy
 */
export interface CircuitBreakerPolicy {
  readonly failureThreshold: number; // Falhas consecutivas para abrir
  readonly successThreshold: number; // Sucessos consecutivos para fechar
  readonly openDuration: number; // ms em estado OPEN
  readonly halfOpenMaxRequests: number; // Requests permitidos em HALF_OPEN
}

/**
 * Anthropic Messages API request format
 * Documentação: https://docs.anthropic.com/claude/reference/messages_post
 */
export interface AnthropicMessagesRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly AnthropicMessage[];
  readonly system?: string | readonly AnthropicContentBlock[];
  readonly tools?: readonly AnthropicTool[];
  readonly temperature?: number;
  readonly stream?: boolean;
}

export interface AnthropicMessage {
  readonly role: "user" | "assistant";
  readonly content: string | readonly AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  readonly type: "text" | "tool_use" | "tool_result";
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: Record<string, unknown>;
  readonly tool_use_id?: string;
  readonly content?: string;
  readonly cache_control?: { readonly type: "ephemeral" };
}

export interface AnthropicTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
  readonly cache_control?: { readonly type: "ephemeral" };
}

// Mantém aliases para compatibilidade
export type LiteLLMRequest = AnthropicMessagesRequest;
export type OpenAIMessage = AnthropicMessage; // Deprecated: use AnthropicMessage
export type OpenAITool = AnthropicTool; // Deprecated: use AnthropicTool

/**
 * Anthropic Messages API streaming events
 * Documentação: https://docs.anthropic.com/claude/reference/messages-streaming
 */
export type AnthropicStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent;

export interface MessageStartEvent {
  readonly type: "message_start";
  readonly message: {
    readonly id: string;
    readonly type: "message";
    readonly role: "assistant";
    readonly content: readonly AnthropicContentBlock[];
    readonly model: string;
    readonly stop_reason: string | null;
    readonly stop_sequence: string | null;
    readonly usage: {
      readonly input_tokens: number;
      readonly output_tokens: number;
    };
  };
}

export interface ContentBlockStartEvent {
  readonly type: "content_block_start";
  readonly index: number;
  readonly content_block: AnthropicContentBlock;
}

export interface ContentBlockDeltaEvent {
  readonly type: "content_block_delta";
  readonly index: number;
  readonly delta: {
    readonly type: "text_delta" | "input_json_delta";
    readonly text?: string;
    readonly partial_json?: string;
  };
}

export interface ContentBlockStopEvent {
  readonly type: "content_block_stop";
  readonly index: number;
}

export interface MessageDeltaEvent {
  readonly type: "message_delta";
  readonly delta: {
    readonly stop_reason?: string;
    readonly stop_sequence?: string | null;
  };
  readonly usage?: {
    readonly output_tokens: number;
  };
}

export interface MessageStopEvent {
  readonly type: "message_stop";
}

export interface PingEvent {
  readonly type: "ping";
}

export interface ErrorEvent {
  readonly type: "error";
  readonly error: {
    readonly type: string;
    readonly message: string;
  };
}

// Alias para compatibilidade
export type OpenAIStreamChunk = AnthropicStreamEvent;

/**
 * SSE event from stream
 */
export interface SSEEvent {
  readonly event?: string;
  readonly data: string;
  readonly id?: string;
  readonly retry?: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failing fast
  HALF_OPEN = "HALF_OPEN", // Testing recovery
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  readonly state: CircuitState;
  readonly failures: number;
  readonly successes: number;
  readonly lastFailureTime?: number;
  readonly lastSuccessTime?: number;
  readonly totalRequests: number;
  readonly totalFailures: number;
}

/**
 * Transport request options
 */
export interface TransportRequestOptions {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly timeout?: number;
}

/**
 * Default configurations
 */
export const DEFAULT_LITELLM_CONFIG: Partial<LiteLLMConfig> = {
  apiBase: "https://litellm.int.thomsonreuters.com",
  model: "anthropic/claude-opus-4-7",
  timeoutMs: 120000,
  retryPolicy: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },
  circuitBreakerPolicy: {
    failureThreshold: 5,
    successThreshold: 2,
    openDuration: 60000,
    halfOpenMaxRequests: 1,
  },
  enablePromptCaching: true,
};
