import * as vscode from "vscode";
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
import { LiteLLMOpenAIAdapter } from "../litellm/litellmOpenAIAdapter";
import { SSEParser, parseOpenAIStreamChunk } from "../litellm/litellmParser";
import type { OpenAIStreamChunk } from "../litellm/litellmTypes";
import { classifyError } from "../litellm/litellmErrors";

const OPENAI_USER_AGENT = "korix-code-plugin/1.0.0 (external, sdk-client)";

export class OpenAIProvider implements AIProvider {
  readonly type: ProviderType = "openai";
  readonly config: ProviderConfig;
  private readonly transport: Transport;
  private readonly openAIAdapter: LiteLLMOpenAIAdapter;
  private readonly parser = new SSEParser();

  constructor(config: ProviderConfig, transport: Transport) {
    this.config = config;
    this.transport = transport;
    this.openAIAdapter = new LiteLLMOpenAIAdapter(config);
  }

  async *send(
    input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    const startTime = Date.now();
    const baseUrl = this.config.baseUrl ?? "https://api.openai.com";
    const apiBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${apiBase}/v1/chat/completions`;

    try {
      const request = this.openAIAdapter.buildRequest(input);
      
      // Obtain current VS Code workspace root for Mesh integration
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": OPENAI_USER_AGENT,
      };

      if (workspaceRoot) {
        headers["X-Korix-Workspace-Root"] = workspaceRoot;
      }

      const response = await this.transport.request(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ...request, stream: true }),
        },
        context.signal,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sawTerminalEvent = false;

      this.parser.reset();

      try {
        while (true) {
          if (context.signal?.aborted) {
            await reader.cancel();
            break;
          }

          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await reader.read();
          } catch (error) {
            if (sawTerminalEvent && this.isBenignStreamTermination(error)) {
              break;
            }
            throw error;
          }

          const { done, value } = readResult;
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });

          for (const event of this.parser.parse(chunkText)) {
            if (event.data.trim() === "[DONE]") {
              break;
            }

            const streamEvent = parseOpenAIStreamChunk(event.data);
            if (!streamEvent) {
              continue;
            }

            if (this.hasTerminalFinishReason(streamEvent)) {
              sawTerminalEvent = true;
            }

            const normalizedEvents = this.openAIAdapter.normalizeChunk(streamEvent, {
              correlationId: context.correlationId,
              sessionId: context.sessionId,
              agentRunId: context.agentRunId,
              iterationId: context.iterationId,
            });

            for (const normalized of normalizedEvents) {
              if (normalized.type === "usage") {
                totalInputTokens = normalized.inputTokens;
                totalOutputTokens = normalized.outputTokens;
              }
              yield normalized;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        model: this.config.model,
        totalDuration: Date.now() - startTime,
        usage:
          totalInputTokens > 0 || totalOutputTokens > 0
            ? { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
            : undefined,
      };
    } catch (error) {
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
    // OpenAI is a stateless HTTP provider, no active cleanup required
  }

  private hasTerminalFinishReason(chunk: OpenAIStreamChunk): boolean {
    return (
      chunk.choices?.some((choice) => choice.finish_reason !== null) ?? false
    );
  }

  private isBenignStreamTermination(error: unknown): boolean {
    return (
      error instanceof TypeError &&
      error.message.toLowerCase().includes("terminated")
    );
  }
}
