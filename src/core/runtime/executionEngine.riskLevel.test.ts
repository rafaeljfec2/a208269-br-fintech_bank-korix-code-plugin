import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PermissionManager } from "../../harness/permissions";
import type { Tool } from "../../harness/toolRegistry";
import { ToolRegistry } from "../../harness/toolRegistry";
import { Logger } from "../../telemetry/logger";
import type {
  AIProvider,
  ProviderConfig,
  ProviderEvent,
  ProviderInput,
  ProviderMetadata,
  RequestContext,
} from "../providers/types";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import { RuntimeState } from "./runtimeState";

class ToolCallProvider implements AIProvider {
  readonly type = "test";
  readonly config: ProviderConfig = {
    type: "test",
    apiKey: "test",
    model: "test-model",
  };

  constructor(private readonly toolName: string) {}

  async *send(
    _input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    const correlation = {
      correlationId: context.correlationId,
      sessionId: context.sessionId,
      agentRunId: context.agentRunId,
      iterationId: context.iterationId,
    };

    yield {
      type: "tool_call_complete",
      index: 0,
      id: "tool-call-1",
      name: this.toolName,
      arguments: JSON.stringify({ path: "src/index.ts" }),
      timestamp: Date.now(),
      correlation,
    };
    yield {
      type: "finish",
      reason: "tool_calls",
      timestamp: Date.now(),
      correlation,
    };
    return {
      model: this.config.model,
      totalDuration: 1,
    };
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

describe("ExecutionEngine tool risk inference", () => {
  it("should treat FileChunks as read-only and skip approval", async () => {
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const approvalRequester = vi.fn(async () => ({
      approved: true,
      level: "always" as const,
    }));
    const toolExecute = vi.fn(async () => ({
      success: true,
      data: {
        chunk: "content",
        isComplete: true,
      },
    }));
    const toolRegistry = new ToolRegistry();
    const tool: Tool<{ readonly path: string }, { readonly chunk: string }> = {
      name: "FileChunks",
      description: "Read file chunks.",
      schema: z.object({ path: z.string() }),
      execute: toolExecute,
    };
    toolRegistry.register(tool);

    const engine = new ExecutionEngine(
      new ToolCallProvider("FileChunks"),
      toolRegistry,
      new PermissionManager(approvalRequester),
      eventEmitter,
      new CheckpointManager(logger),
      new RuntimeMetrics(logger),
      new IterationGuard(logger, eventEmitter),
      new CancellationManager(logger, eventEmitter),
      logger,
      "system",
    );
    const state = new RuntimeState({
      mode: "agent",
      workspaceRoot: "/repo",
      openFiles: [],
    });

    await engine.step(state);

    expect(toolExecute).toHaveBeenCalledTimes(1);
    expect(approvalRequester).not.toHaveBeenCalled();
  });
});
