import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PermissionManager } from "../../harness/permissions";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";
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
import type { ExecutionContext } from "../types";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import { RuntimeState } from "./runtimeState";

const TOOL_NAME = "CaptureSnapshot";

class ToolCallingProvider implements AIProvider {
  readonly type = "test";
  readonly config: ProviderConfig = {
    type: "test",
    apiKey: "test",
    model: "test-model",
  };

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
      name: TOOL_NAME,
      arguments: "{}",
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

class SnapshotCapturingTool implements Tool<
  Record<string, never>,
  { readonly ok: true }
> {
  readonly name = TOOL_NAME;
  readonly description = "Captures the runtime state snapshot";
  readonly schema = z.object({});
  snapshot:
    | ReturnType<NonNullable<ToolContext["getRuntimeStateSnapshot"]>>
    | undefined;

  requiresApproval(): boolean {
    return false;
  }

  allowedInMode(): boolean {
    return true;
  }

  async execute(
    _input: Record<string, never>,
    context: ToolContext,
  ): Promise<ToolResult<{ readonly ok: true }>> {
    this.snapshot = context.getRuntimeStateSnapshot?.();
    return {
      success: true,
      data: { ok: true as const },
    };
  }
}

function createContext(): ExecutionContext {
  return {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: ["/repo/src/index.ts"],
  };
}

function createEngine(tool: Tool): ExecutionEngine {
  const logger = new Logger({ level: "error" });
  const eventEmitter = new RuntimeEventEmitter();
  const checkpointManager = new CheckpointManager(logger);
  const metrics = new RuntimeMetrics(logger);
  const iterationGuard = new IterationGuard(logger, eventEmitter);
  const cancellationManager = new CancellationManager(logger, eventEmitter);
  const registry = new ToolRegistry();
  registry.register(tool);
  const permissionManager = new PermissionManager(async () => ({
    approved: true,
  }));

  return new ExecutionEngine(
    new ToolCallingProvider(),
    registry,
    permissionManager,
    eventEmitter,
    checkpointManager,
    metrics,
    iterationGuard,
    cancellationManager,
    logger,
    "system",
  );
}

describe("ExecutionEngine parent state snapshot context", () => {
  it("should expose a serialized runtime state snapshot to tools", async () => {
    const tool = new SnapshotCapturingTool();
    const engine = createEngine(tool);
    const state = new RuntimeState(createContext(), 1);
    state.addMessage({
      role: "user",
      content: "Use the tool",
      timestamp: 1000,
    });
    state.markFileModified("/repo/src/index.ts");

    await engine.step(state);

    expect(tool.snapshot?.conversation.messages[0]?.content).toBe(
      "Use the tool",
    );
    expect(tool.snapshot?.workspace.modifiedFiles).toEqual([
      "/repo/src/index.ts",
    ]);
    expect(() => JSON.stringify(tool.snapshot)).not.toThrow();
  });
});
