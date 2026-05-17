/**
 * LiteLLM Provider - stateless, event-driven
 * Emite ProviderEvents puros, NÃO mantém estado
 *
 * IMPORTANTE: Usa Anthropic Messages API format (/v1/messages), NÃO OpenAI format!
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderInput,
  ProviderMetadata,
  ProviderEvent,
  RequestContext,
} from "../types";
import type { ProviderType } from "../../../providers/types";
import type { Transport } from "../transport/httpTransport";
import type {
  AnthropicMessagesRequest,
  AnthropicMessage,
  AnthropicTool,
  AnthropicContentBlock,
} from "./litellmTypes";
import { LiteLLMClient } from "./litellmClient";
import { LiteLLMNormalizer } from "./litellmNormalizer";
import { classifyError } from "./litellmErrors";
import { getDefaultTemperature, validateTemperature } from "../normalization";

/**
 * LiteLLM Provider implementation
 * 100% STATELESS - não mantém tool calls, buffers, ou qualquer estado agentic
 */
export class LiteLLMProvider implements AIProvider {
  readonly type: ProviderType = "litellm";
  readonly config: ProviderConfig;

  private readonly client: LiteLLMClient;
  private readonly normalizer: LiteLLMNormalizer;

  constructor(config: ProviderConfig, transport: Transport) {
    this.config = config;
    this.client = new LiteLLMClient(
      config.baseUrl ?? "https://litellm.int.thomsonreuters.com",
      transport,
    );
    this.normalizer = new LiteLLMNormalizer();
  }

  /**
   * Send request e stream ProviderEvents
   * Provider é STATELESS - apenas emite eventos puros
   */
  async *send(
    input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    const startTime = Date.now();

    try {
      // Build request (Anthropic Messages API format)
      const request = this.buildRequest(input);

      // Stream from client
      const stream = this.client.streamMessages(
        request,
        {
          correlationId: context.correlationId,
          sessionId: context.sessionId,
          agentRunId: context.agentRunId,
          iterationId: context.iterationId,
        },
        context.signal,
      );

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      // Process stream
      for await (const event of stream) {
        // Normalize Anthropic event → ProviderEvents
        const events = this.normalizer.normalize(event, {
          correlationId: context.correlationId,
          sessionId: context.sessionId,
          agentRunId: context.agentRunId,
          iterationId: context.iterationId,
        });

        // Yield all events
        for (const event of events) {
          if (event.type === "usage") {
            totalInputTokens = event.inputTokens;
            totalOutputTokens = event.outputTokens;
          }
          yield event;
        }
      }

      // Return metadata
      return {
        model: this.config.model,
        totalDuration: Date.now() - startTime,
        usage:
          totalInputTokens > 0 || totalOutputTokens > 0
            ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
            : undefined,
      };
    } catch (error) {
      // Emit error event
      const classified = classifyError(error);
      yield {
        type: "error",
        error: classified,
        timestamp: Date.now(),
        correlation: {
          correlationId: context.correlationId,
          sessionId: context.sessionId,
          agentRunId: context.agentRunId,
          iterationId: context.iterationId,
        },
      };

      throw classified;
    }
  }

  async dispose(): Promise<void> {
    // LiteLLM não requer cleanup (HTTP stateless)
  }

  /**
   * Build Anthropic Messages API request
   */
  private buildRequest(input: ProviderInput): AnthropicMessagesRequest {
    const request: AnthropicMessagesRequest = {
      model: this.config.model,
      max_tokens: input.maxTokens ?? this.config.maxTokens ?? 8192, // Default 8192 (Anthropic max_tokens obrigatório)
      messages: this.convertMessages(input),
      system: input.system, // Anthropic: system é campo separado, não mensagem
      tools: input.tools ? this.convertTools(input.tools) : undefined,
      stream: true,
    };

    // Claude 4.x deprecou temperature - não enviar para esses modelos
    if (!this.isClaude4x(this.config.model)) {
      request.temperature = this.getTemperature(input.temperature);
    }

    return request;
  }

  /**
   * Convert messages para Anthropic format
   * Anthropic só aceita user/assistant (system é campo separado)
   */
  private convertMessages(input: ProviderInput): readonly AnthropicMessage[] {
    const messages: AnthropicMessage[] = [];

    // Convert user/assistant/tool messages
    for (const msg of input.messages) {
      // Tool result → tool_result content block
      if (msg.role === "tool") {
        const toolResultBlock: AnthropicContentBlock = {
          type: "tool_result",
          tool_use_id: msg.metadata?.toolCallId as string | undefined ?? "",
          content: msg.content,
        };

        messages.push({
          role: "user", // Anthropic: tool results são enviados como user messages
          content: [toolResultBlock],
        });
      } else if (msg.role === "user" || msg.role === "assistant") {
        // User/assistant messages
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  /**
   * Convert tools para Anthropic format
   * Anthropic: sem wrapper "function", schema direto
   */
  private convertTools(
    tools: readonly import("../../providers/types").ToolDefinition[],
  ): readonly AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  /**
   * Get temperatura válida para o modelo
   */
  private getTemperature(requested?: number): number {
    const temperature = requested ?? this.config.temperature;

    if (temperature === undefined) {
      return getDefaultTemperature(this.config.model);
    }

    // Validate
    if (!validateTemperature(this.config.model, temperature)) {
      const defaultTemp = getDefaultTemperature(this.config.model);
      console.warn(
        `Invalid temperature ${temperature} for model ${this.config.model}, using ${defaultTemp}`,
      );
      return defaultTemp;
    }

    return temperature;
  }

  /**
   * Detecta se o modelo é Claude 4.x (que deprecou temperature)
   * Claude 4.x: opus-4.6, opus-4.7, sonnet-4.5, sonnet-4.6, haiku-4.5, etc.
   */
  private isClaude4x(model: string): boolean {
    return /claude-(opus|sonnet|haiku)-4.[0-9]+/i.test(model);
  }
}
