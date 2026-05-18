/**
 * Execution Engine - stream processor & state coordinator (THE BRAIN)
 *
 * Orchestrates: Provider ↔ Tools ↔ State
 * Transforms: StreamChunk → RuntimeEvent
 * Executes: Tools sequentially with permission checking
 */

import type {
  AIProvider,
  ProviderEvent,
  RequestContext,
} from "../providers/types";
import type { ToolRegistry } from "../../harness/toolRegistry";
import type { PermissionManager } from "../../harness/permissions";
import type { Logger } from "../../telemetry/logger";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { CheckpointManager } from "./checkpoints";
import { RuntimeMetrics } from "./runtimeMetrics";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { RuntimeState } from "./runtimeState";
import type { StepResult } from "./runtimeTypes";

interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

export class ExecutionEngine {
  private currentTextBuffer = "";
  private currentThinkingBuffer = "";
  private pendingToolCalls: PendingToolCall[] = [];

  constructor(
    private readonly provider: AIProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly permissionManager: PermissionManager,
    private readonly eventEmitter: RuntimeEventEmitter,
    // @ts-expect-error - Reserved for future use
    private readonly __checkpointManager: CheckpointManager,
    private readonly metrics: RuntimeMetrics,
    private readonly iterationGuard: IterationGuard,
    private readonly cancellationManager: CancellationManager,
    private readonly logger: Logger,
  ) {}

  async step(state: RuntimeState): Promise<StepResult> {
    this.resetBuffers();

    const result: StepResult = {
      hadToolCalls: false,
      hadThinking: false,
      tokenCount: 0,
      recoverable: true,
    };

    try {
      // Prepare messages and tools
      const conversation = state.getConversation();
      const tools = this.toolRegistry.toProviderDefinitions();

      // Build request context
      const context: RequestContext = {
        correlationId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(), // TODO: Get from DI container session manager
        agentRunId: crypto.randomUUID(),
        iterationId: state.getExecution().currentIteration,
      };

      // Stream from provider
      const stream = this.provider.send(
        {
          messages: [...conversation.messages], // Copy readonly array
          tools,
          maxTokens: 4096,
        },
        context,
      );

      // Process stream events
      for await (const event of stream) {
        this.cancellationManager.checkCancellation();

        this.processEvent(event, state, result);
      }

      // Add assistant message if text was generated
      if (this.currentTextBuffer) {
        state.addMessage({
          role: "assistant",
          content: this.currentTextBuffer,
          timestamp: Date.now(),
        });
      }

      // Execute pending tool calls
      if (this.pendingToolCalls.length > 0) {
        await this.executeToolCalls(state);
        result.hadToolCalls = true;
      }

      return result;
    } catch (error) {
      this.logger.error("Execution step failed", error);
      result.error = (error as Error).message;
      result.recoverable = this.isRecoverable(error as Error);
      throw error;
    }
  }

  private processEvent(
    event: ProviderEvent,
    _state: RuntimeState,
    result: StepResult,
  ): void {
    switch (event.type) {
      case "token":
        this.currentTextBuffer += event.value;
        this.metrics.recordToken();
        result.tokenCount++;
        this.eventEmitter.emitEvent({
          type: "token",
          content: event.value,
          timestamp: Date.now(),
        });
        break;

      case "thinking":
        this.currentThinkingBuffer += event.value;
        result.hadThinking = true;
        this.eventEmitter.emitEvent({
          type: "thinking",
          content: event.value,
          timestamp: Date.now(),
        });
        break;

      case "tool_call_complete":
        this.pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: JSON.parse(event.arguments),
        });
        this.eventEmitter.emitEvent({
          type: "tool_call",
          id: event.id,
          name: event.name,
          input: JSON.parse(event.arguments),
          timestamp: Date.now(),
        });
        break;

      case "usage":
        // Usage events are tracked internally but not emitted to RuntimeEventEmitter
        // Metrics are recorded in the final metadata
        break;

      case "finish":
        result.stopReason = event.reason as
          | "end_turn"
          | "stop"
          | "max_tokens"
          | "stop_sequence"
          | undefined;
        this.eventEmitter.emitEvent({
          type: "done",
          stopReason: event.reason,
          usage: undefined,
          timestamp: Date.now(),
        });
        break;

      case "error":
        throw event.error;

      case "tool_call_delta":
        // LiteLLMNormalizer already assembles deltas into tool_call_complete
        // This case is here for completeness but should not be reached
        break;
    }
  }

  private async executeToolCalls(state: RuntimeState): Promise<void> {
    for (const toolCall of this.pendingToolCalls) {
      this.cancellationManager.checkCancellation();
      this.iterationGuard.recordToolCall(toolCall.name);

      // Check permission
      const toolDef = this.toolRegistry.get(toolCall.name);
      const riskLevel = this.inferRiskLevel(toolCall.name);
      const response = await this.permissionManager.checkPermission({
        tool: toolCall.name,
        input: toolCall.input,
        description: toolDef?.description ?? `Execute ${toolCall.name}`,
        riskLevel,
      });

      if (!response.approved) {
        this.eventEmitter.emitEvent({
          type: "tool_denied",
          id: toolCall.id,
          name: toolCall.name,
          reason: "Permission denied",
          timestamp: Date.now(),
        });
        continue;
      }

      this.eventEmitter.emitEvent({
        type: "tool_approved",
        id: toolCall.id,
        name: toolCall.name,
        timestamp: Date.now(),
      });

      // Execute tool
      const startTime = Date.now();
      const workspace = state.getWorkspace();

      const result = await this.toolRegistry.execute(
        toolCall.name,
        toolCall.input,
        {
          execution: {
            mode: "agent",
            workspaceRoot: workspace.root,
            openFiles: Array.from(workspace.openFiles),
          },
          workspaceRoot: workspace.root,
        },
      );

      const duration = Date.now() - startTime;

      // Record metrics
      this.metrics.recordToolCall(toolCall.name);
      state.recordToolCall(
        toolCall.name,
        toolCall.input,
        result.data,
        duration,
        result.success,
      );

      // Emit result
      this.eventEmitter.emitEvent({
        type: "tool_result",
        id: toolCall.id,
        name: toolCall.name,
        success: result.success,
        result: result.data,
        duration,
        timestamp: Date.now(),
      });

      // Add tool result message
      state.addMessage({
        role: "tool",
        content: JSON.stringify(result.data ?? { error: result.error }),
        timestamp: Date.now(),
        metadata: { toolCallId: toolCall.id, toolName: toolCall.name },
      });
    }
  }

  private resetBuffers(): void {
    this.currentTextBuffer = "";
    this.currentThinkingBuffer = "";
    this.pendingToolCalls = [];
  }

  private inferRiskLevel(toolName: string): "low" | "medium" | "high" {
    const lowerName = toolName.toLowerCase();

    // High risk: write, edit, delete, execute, run commands
    if (/write|edit|delete|remove|execute|run|command|patch/.test(lowerName)) {
      return "high";
    }

    // Low risk: read-only operations
    if (/read|list|get|search|find|grep|status|diff/.test(lowerName)) {
      return "low";
    }

    // Default: medium risk
    return "medium";
  }

  private isRecoverable(error: Error): boolean {
    return /timeout|ECONNREFUSED|rate.*limit|429|503/i.test(error.message);
  }
}
