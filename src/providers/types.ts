/**
 * Provider abstraction types for LLM integration
 */

import type { Message } from "../core/types";

export type ProviderType = "anthropic" | "openai" | "ollama" | "openrouter" | "litellm";

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ProviderInput {
  messages: Message[];
  tools?: ToolDefinition[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "error"; error: string; code?: string }
  | { type: "done"; stopReason?: string; usage?: TokenUsage };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface StreamMetadata {
  requestId?: string;
  model: string;
  stopReason?: string;
  usage?: TokenUsage;
}

export interface AIProvider {
  readonly type: ProviderType;
  readonly config: ProviderConfig;

  /**
   * Send a request and stream the response
   * @returns AsyncGenerator yielding stream chunks
   */
  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;

  /**
   * Cleanup provider resources
   */
  dispose(): Promise<void>;
}

export interface ProviderFactory {
  create(config: ProviderConfig): AIProvider;
  supports(type: ProviderType): boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public cause?: Error,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
