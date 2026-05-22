import type { Logger } from "../../telemetry/logger";
import type {
  AIProvider,
  ProviderEvent,
  ProviderInput,
  ProviderMetadata,
  RequestContext,
} from "../providers/types";
import type { ExecutionContext, Message } from "../types";
import type { ChatHistoryMessage } from "./thinking/InteractionContextCompiler";
import { RuntimeMetrics } from "./runtimeMetrics";
import type { RuntimeMetricsSnapshot } from "./runtimeTypes";
import { RuntimeEventEmitter } from "./runtimeEvents";

export interface DirectLlmExecutorInput {
  readonly initialMessage: string;
  readonly previousMessages: readonly ChatHistoryMessage[];
  readonly context: ExecutionContext;
  readonly systemPrompt: string;
  readonly maxTokens?: number;
}

export class DirectLlmExecutor {
  constructor(
    private readonly provider: AIProvider,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly logger: Logger,
  ) {}

  async run(input: DirectLlmExecutorInput): Promise<RuntimeMetricsSnapshot> {
    const metrics = new RuntimeMetrics(this.logger);
    const requestContext: RequestContext = {
      correlationId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      agentRunId: crypto.randomUUID(),
      iterationId: 0,
    };
    const startedAt = Date.now();
    let firstOutputEmitted = false;
    let stopReason: string | undefined;
    let tokenCount = 0;
    let hadToolCalls = false;
    let metadata: ProviderMetadata | undefined;

    this.eventEmitter.emitEvent({
      type: "provider_request_start",
      iteration: 0,
      correlationId: requestContext.correlationId,
      toolCount: 0,
      toolChoice: "none",
      timestamp: startedAt,
    });

    try {
      const providerInput: ProviderInput = {
        messages: this.toMessages(input.previousMessages, input.initialMessage),
        toolChoice: "none",
        system: input.systemPrompt,
        maxTokens: input.maxTokens,
      };
      const stream = this.provider.send(providerInput, requestContext);

      while (true) {
        const next = await stream.next();
        if (next.done) {
          metadata = next.value;
          break;
        }

        const event = next.value;
        const outputKind = this.resolveFirstOutputKind(event);
        if (!firstOutputEmitted && outputKind) {
          firstOutputEmitted = true;
          const latency = Date.now() - startedAt;
          metrics.recordProviderFirstOutputLatency(latency);
          this.eventEmitter.emitEvent({
            type: "provider_first_output",
            iteration: 0,
            correlationId: requestContext.correlationId,
            outputKind,
            latency,
            timestamp: Date.now(),
          });
        }

        switch (event.type) {
          case "token":
            tokenCount += 1;
            metrics.recordToken();
            this.eventEmitter.emitEvent({
              type: "token",
              content: event.value,
              timestamp: Date.now(),
            });
            break;
          case "thinking":
            this.eventEmitter.emitEvent({
              type: "thinking",
              content: event.value,
              timestamp: Date.now(),
            });
            break;
          case "tool_call_delta":
          case "tool_call_complete":
            hadToolCalls = true;
            this.logger.warn("Provider emitted a tool call in direct LLM path", {
              eventType: event.type,
            });
            break;
          case "finish":
            stopReason = event.reason;
            break;
          case "usage":
            break;
          case "error":
            this.eventEmitter.emitEvent({
              type: "error",
              error: event.error.message,
              iteration: 0,
              recoverable: false,
              timestamp: Date.now(),
            });
            break;
        }
      }

      const providerDuration = Date.now() - startedAt;
      metrics.recordProviderDuration(providerDuration);
      metrics.recordIteration();
      this.eventEmitter.emitEvent({
        type: "provider_request_end",
        iteration: 0,
        correlationId: requestContext.correlationId,
        duration: providerDuration,
        stopReason,
        tokenCount,
        hadToolCalls,
        timestamp: Date.now(),
      });

      const usage = metadata?.usage
        ? {
            inputTokens: metadata.usage.inputTokens,
            outputTokens: metadata.usage.outputTokens,
          }
        : undefined;
      this.eventEmitter.emitEvent({
        type: "done",
        stopReason: stopReason ?? "end_turn",
        usage,
        timestamp: Date.now(),
      });

      const snapshot = metrics.finalize();
      this.eventEmitter.emitEvent({
        type: "execution_complete",
        success: true,
        iterations: 1,
        metrics: snapshot,
        timestamp: Date.now(),
      });

      return snapshot;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Direct LLM execution failed", err);
      const snapshot = metrics.finalize();

      this.eventEmitter.emitEvent({
        type: "done",
        stopReason: "error",
        usage: undefined,
        timestamp: Date.now(),
      });
      this.eventEmitter.emitEvent({
        type: "execution_complete",
        success: false,
        iterations: 1,
        metrics: snapshot,
        timestamp: Date.now(),
      });

      throw err;
    }
  }

  private toMessages(
    previousMessages: readonly ChatHistoryMessage[],
    initialMessage: string,
  ): readonly Message[] {
    const timestamp = Date.now();
    const messages: Message[] = [];

    for (const message of previousMessages) {
      if (message.role === "system") {
        continue;
      }

      messages.push({
        role: message.role,
        content: message.content,
        timestamp,
      });
    }

    messages.push({
      role: "user",
      content: initialMessage,
      timestamp,
    });

    return messages;
  }

  private resolveFirstOutputKind(
    event: ProviderEvent,
  ): "token" | "thinking" | "tool_call" | null {
    switch (event.type) {
      case "token":
        return "token";
      case "thinking":
        return "thinking";
      case "tool_call_delta":
      case "tool_call_complete":
        return "tool_call";
      case "usage":
      case "finish":
      case "error":
        return null;
    }
  }
}
