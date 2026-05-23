import type {
  CorrelationContext,
  ProviderConfig,
  ProviderEvent,
  ProviderInput,
} from "../types";
import {
  getDefaultTemperature,
  normalizeFinishReason,
  validateTemperature,
} from "../normalization";
import type {
  OpenAIChatCompletionsRequest,
  OpenAIChatMessage,
  OpenAIChatTool,
  OpenAIStreamChunk,
} from "./litellmTypes";

export class LiteLLMOpenAIAdapter {
  constructor(private readonly config: ProviderConfig) {}

  buildRequest(input: ProviderInput): OpenAIChatCompletionsRequest {
    const messages = this.convertMessages(input);

    if (messages.length === 0) {
      throw new Error("[LiteLLM] Messages array cannot be empty");
    }

    const maxTokens = input.maxTokens ?? this.config.maxTokens ?? 8192;

    return {
      model: this.config.model,
      messages,
      max_tokens: this.usesMaxCompletionTokens() ? undefined : maxTokens,
      max_completion_tokens: this.usesMaxCompletionTokens()
        ? maxTokens
        : undefined,
      tools: input.tools ? this.convertTools(input.tools) : undefined,
      tool_choice: this.convertToolChoice(input.toolChoice),
      stream: true,
      temperature: this.supportsCustomTemperature()
        ? this.getTemperature(input.temperature)
        : undefined,
    };
  }

  normalizeChunk(
    chunk: OpenAIStreamChunk,
    correlation: CorrelationContext,
  ): ProviderEvent[] {
    const events: ProviderEvent[] = [];
    const timestamp = Date.now();

    for (const choice of chunk.choices ?? []) {
      const content = choice.delta?.content;
      if (content) {
        events.push({
          type: "token",
          value: content,
          timestamp,
          correlation,
        });
      }

      for (const toolCall of choice.delta?.tool_calls ?? []) {
        events.push({
          type: "tool_call_delta",
          index: toolCall.index,
          id: toolCall.id,
          name: toolCall.function?.name,
          argumentsChunk: toolCall.function?.arguments,
          timestamp,
          correlation,
        });
      }

      if (choice.finish_reason) {
        events.push({
          type: "finish",
          reason: normalizeFinishReason(choice.finish_reason),
          timestamp,
          correlation,
        });
      }
    }

    if (chunk.usage) {
      events.push({
        type: "usage",
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
        timestamp,
        correlation,
      });
    }

    return events;
  }

  private convertMessages(input: ProviderInput): readonly OpenAIChatMessage[] {
    const messages: OpenAIChatMessage[] = [];

    if (input.system) {
      messages.push({
        role: "system",
        content: input.system,
      });
    }

    for (const msg of input.messages) {
      if (msg.role === "tool") {
        messages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: (msg.metadata?.toolCallId as string | undefined) ?? "",
        });
        continue;
      }

      if (msg.role === "user") {
        messages.push({
          role: "user",
          content: msg.content,
        });
        continue;
      }

      if (msg.role === "assistant") {
        messages.push(this.convertAssistantMessage(msg));
      }
    }

    return messages;
  }

  private convertAssistantMessage(
    msg: ProviderInput["messages"][number],
  ): OpenAIChatMessage {
    const toolCalls = msg.metadata?.toolCalls as
      | Array<{
          readonly id: string;
          readonly name: string;
          readonly input: unknown;
        }>
      | undefined;

    if (!toolCalls || toolCalls.length === 0) {
      return {
        role: "assistant",
        content: msg.content,
      };
    }

    return {
      role: "assistant",
      content: msg.content.length > 0 ? msg.content : null,
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toRecordInput(toolCall.input)),
        },
      })),
    };
  }

  private convertTools(
    tools: readonly import("../../providers/types").ToolDefinition[],
  ): readonly OpenAIChatTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  private convertToolChoice(
    toolChoice: ProviderInput["toolChoice"],
  ): OpenAIChatCompletionsRequest["tool_choice"] {
    if (!toolChoice || toolChoice === "none") {
      return undefined;
    }

    if (toolChoice === "required" || toolChoice === "auto") {
      return toolChoice;
    }

    return {
      type: "function",
      function: {
        name: toolChoice.name,
      },
    };
  }

  private getTemperature(requested?: number): number {
    const temperature = requested ?? this.config.temperature;

    if (temperature === undefined) {
      return getDefaultTemperature(this.config.model);
    }

    if (!validateTemperature(this.config.model, temperature)) {
      return getDefaultTemperature(this.config.model);
    }

    return temperature;
  }

  private usesMaxCompletionTokens(): boolean {
    return this.isOpenAIReasoningModel();
  }

  private supportsCustomTemperature(): boolean {
    return !this.isOpenAIReasoningModel();
  }

  private isOpenAIReasoningModel(): boolean {
    const model = this.config.model.toLowerCase();
    return model.startsWith("openai/gpt-5") || model.startsWith("openai/o");
  }
}

function toRecordInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return { value: input };
}
