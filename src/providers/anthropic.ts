/**
 * Anthropic Claude provider implementation
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ProviderConfig,
  ProviderInput,
  StreamChunk,
  StreamMetadata,
  ToolDefinition,
  TokenUsage,
} from "./types";

export class AnthropicProvider implements AIProvider {
  readonly type = "anthropic" as const;
  readonly config: ProviderConfig;
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async *send(
    input: ProviderInput,
  ): AsyncGenerator<StreamChunk, StreamMetadata, void> {
    try {
      const messages = this.convertMessages(input.messages);
      const tools = input.tools ? this.convertTools(input.tools) : undefined;

      const stream = await this.client.messages.create({
        model: this.config.model,
        max_tokens: input.maxTokens ?? this.config.maxTokens ?? 4096,
        temperature: input.temperature ?? this.config.temperature ?? 1.0,
        system: input.system,
        messages,
        tools,
        stream: true,
      });

      let stopReason: string | undefined;
      let usage: TokenUsage | undefined;

      for await (const event of stream) {
        if (event.type === "message_start") {
          usage = {
            inputTokens: event.message.usage.input_tokens,
            outputTokens: event.message.usage.output_tokens,
          };
        } else if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            // Tool use block started - will accumulate input
            continue;
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield {
              type: "text",
              content: event.delta.text,
            };
          } else if (event.delta.type === "input_json_delta") {
            // Tool input is being streamed - we'll wait for complete block
            continue;
          }
        } else if (event.type === "content_block_stop") {
          // Content block completed
          continue;
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason ?? stopReason;
          if (event.usage) {
            usage = {
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: event.usage.output_tokens,
            };
          }
        } else if (event.type === "message_stop") {
          // Message completed
          break;
        }
      }

      // After stream completes, parse tool calls from message
      // Note: In real implementation, we need to accumulate tool_use blocks during streaming
      // For now, we'll make a non-streaming call to get tool uses if tools were provided
      if (tools && tools.length > 0) {
        // Re-fetch message to get tool calls (optimization needed in future)
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: input.maxTokens ?? this.config.maxTokens ?? 4096,
          temperature: input.temperature ?? this.config.temperature ?? 1.0,
          system: input.system,
          messages,
          tools,
        });

        for (const block of response.content) {
          if (block.type === "tool_use") {
            yield {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            };
          }
        }

        usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
        stopReason = response.stop_reason ?? undefined;
      }

      yield {
        type: "done",
        stopReason,
        usage,
      };

      return {
        model: this.config.model,
        stopReason,
        usage,
      };
    } catch (error) {
      if (error instanceof Error) {
        yield {
          type: "error",
          error: error.message ?? "Unknown error",
        };
      }

      throw this.handleError(error);
    }
  }

  async dispose(): Promise<void> {
    // Anthropic SDK doesn't require explicit cleanup
  }

  private convertMessages(messages: Array<{ role: string; content: string }>) {
    return messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }));
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`Provider error: ${error.message}`, { cause: error });
    }

    return new Error("Unknown provider error occurred");
  }
}
