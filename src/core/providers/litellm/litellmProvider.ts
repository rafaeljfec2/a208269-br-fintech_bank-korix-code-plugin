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
    // Convert messages (já aplica stripTrailingAssistant internamente)
    let messages = this.convertMessages(input);

    // Merge consecutive assistant messages (fix for thinking blocks + responses)
    messages = this.mergeConsecutiveAssistant(messages);

    // Validar após conversão, merge e strip (safety check)
    this.validateMessages(messages);

    const request: AnthropicMessagesRequest = {
      model: this.config.model,
      max_tokens: input.maxTokens ?? this.config.maxTokens ?? 8192, // Default 8192 (Anthropic max_tokens obrigatório)
      messages,
      system: input.system, // Anthropic: system é campo separado, não mensagem
      tools: input.tools ? this.convertTools(input.tools) : undefined,
      stream: true,
      // Claude 4.x deprecou temperature - só incluir para modelos anteriores
      temperature: this.isClaude4x(this.config.model)
        ? undefined
        : this.getTemperature(input.temperature),
    };

    return request;
  }

  /**
   * Remove trailing assistant messages from the array
   * Required for Claude 4.6+ (assistant message prefill no longer supported)
   *
   * References:
   * - https://github.com/livekit/agents/issues/4907
   * - https://github.com/microsoft/agent-framework/issues/5008
   * - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prefill-claudes-response
   */
  private stripTrailingAssistant(
    messages: readonly AnthropicMessage[],
  ): readonly AnthropicMessage[] {
    if (messages.length === 0) {
      return messages;
    }

    let lastIndex = messages.length - 1;

    // Remove ALL trailing assistant messages
    while (lastIndex >= 0 && messages[lastIndex]?.role === "assistant") {
      lastIndex--;
    }

    // If all messages were assistant (invalid state), return empty
    if (lastIndex < 0) {
      return [];
    }

    return messages.slice(0, lastIndex + 1);
  }

  /**
   * Validate messages array before sending to Anthropic API
   * Ensures compliance with Claude 4.6+ requirements
   */
  private validateMessages(messages: readonly AnthropicMessage[]): void {
    // Validação 1: Array não pode estar vazio
    if (messages.length === 0) {
      throw new Error("[LiteLLM] Messages array cannot be empty");
    }

    // Validação 2: Primeira mensagem deve ser 'user'
    const firstMessage = messages[0];
    if (firstMessage?.role !== "user") {
      throw new Error(
        `[LiteLLM] First message must be from user, got: ${firstMessage?.role ?? "undefined"}`,
      );
    }

    // Validação 3: Última mensagem deve ser 'user' (Claude 4.6+ requirement)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "user") {
      throw new Error(
        `[LiteLLM] Last message must be from user, got: ${lastMessage?.role ?? "undefined"}. ` +
          `This prevents "assistant message prefill" errors on Claude 4.6+.`,
      );
    }

    // Validação 4: Sem dupla sequência assistant → assistant
    // NOTE: Esta validação agora é preventiva - mergeConsecutiveAssistant() já corrige isso
    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      if (
        current &&
        next &&
        current.role === "assistant" &&
        next.role === "assistant"
      ) {
        throw new Error(
          `[LiteLLM] Invalid sequence: assistant followed by assistant at index ${i}. ` +
            `This should never happen after mergeConsecutiveAssistant().`,
        );
      }
    }
  }

  /**
   * Merge consecutive assistant messages into single messages
   * Fixes issue where thinking blocks + responses create assistant → assistant sequences
   */
  private mergeConsecutiveAssistant(
    messages: readonly AnthropicMessage[],
  ): readonly AnthropicMessage[] {
    if (messages.length === 0) {
      return messages;
    }

    const merged: AnthropicMessage[] = [];

    for (const current of messages) {
      const last = merged[merged.length - 1];

      // Se último e atual são ambos assistant, mesclar conteúdos
      if (last?.role === "assistant" && current.role === "assistant") {
        // Mesclar conteúdo com quebra de linha dupla
        const lastContent =
          typeof last.content === "string" ? last.content : "";
        const currentContent =
          typeof current.content === "string" ? current.content : "";

        merged[merged.length - 1] = {
          ...last,
          content: lastContent + "\n\n" + currentContent,
        };
      } else {
        // Adicionar novo item (copiar para evitar mutação)
        merged.push({ ...current });
      }
    }

    return merged;
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
          tool_use_id: (msg.metadata?.toolCallId as string | undefined) ?? "",
          content: msg.content,
        };

        messages.push({
          role: "user", // Anthropic: tool results são enviados como user messages
          content: [toolResultBlock],
        });
      } else if (msg.role === "user" || msg.role === "assistant") {
        // User/assistant messages
        const content: string | AnthropicContentBlock[] = msg.content;

        // Assistant messages with tool calls: add tool_use blocks
        if (msg.role === "assistant" && msg.metadata?.toolCalls) {
          const toolCalls = msg.metadata.toolCalls as Array<{
            id: string;
            name: string;
            input: unknown;
          }>;

          const contentBlocks: AnthropicContentBlock[] = [];

          // Add text block if there's content
          if (msg.content) {
            contentBlocks.push({
              type: "text",
              text: msg.content,
            });
          }

          // Add tool_use blocks
          for (const tc of toolCalls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: toRecordInput(tc.input),
            });
          }

          messages.push({
            role: "assistant",
            content: contentBlocks,
          });
        } else {
          // Regular text message
          messages.push({
            role: msg.role,
            content,
          });
        }
      }
    }

    // CRITICAL FIX: Strip trailing assistant messages (Claude 4.6+ requirement)
    return this.stripTrailingAssistant(messages);
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

function toRecordInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return { value: input };
}
