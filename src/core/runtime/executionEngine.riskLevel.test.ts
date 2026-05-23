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

  constructor(
    private readonly toolName: string,
    private readonly argumentsText = JSON.stringify({ path: "src/index.ts" }),
  ) {}

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
      arguments: this.argumentsText,
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

class DeltaToolCallProvider implements AIProvider {
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
      type: "tool_call_delta",
      index: 0,
      id: "tool-call-1",
      name: "GitStatus",
      argumentsChunk: "{",
      timestamp: Date.now(),
      correlation,
    };
    yield {
      type: "tool_call_delta",
      index: 0,
      argumentsChunk: "}",
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

class MalformedDeltaToolCallProvider implements AIProvider {
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
      type: "tool_call_delta",
      index: 0,
      id: "tool-call-1",
      name: "GitStatus",
      argumentsChunk: "{",
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

  it("should treat empty tool arguments as an empty object", async () => {
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const toolExecute = vi.fn(async () => ({
      success: true,
      data: {
        ok: true,
      },
    }));
    const toolRegistry = new ToolRegistry();
    const tool: Tool<Record<string, never>, { readonly ok: boolean }> = {
      name: "GitStatus",
      description: "Get git status.",
      schema: z.object({}),
      execute: toolExecute,
    };
    toolRegistry.register(tool);

    const engine = new ExecutionEngine(
      new ToolCallProvider("GitStatus", ""),
      toolRegistry,
      new PermissionManager(),
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

    expect(toolExecute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ workspaceRoot: "/repo" }),
    );
  });

  it("should assemble streamed tool call deltas before executing tools", async () => {
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const toolExecute = vi.fn(async () => ({
      success: true,
      data: {
        branch: "develop",
      },
    }));
    const toolRegistry = new ToolRegistry();
    const tool: Tool<Record<string, never>, { readonly branch: string }> = {
      name: "GitStatus",
      description: "Get git status.",
      schema: z.object({}),
      execute: toolExecute,
    };
    toolRegistry.register(tool);

    const engine = new ExecutionEngine(
      new DeltaToolCallProvider(),
      toolRegistry,
      new PermissionManager(),
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

    expect(toolExecute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ workspaceRoot: "/repo" }),
    );
  });

  it("should reject malformed streamed tool calls instead of continuing without tools", async () => {
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const toolRegistry = new ToolRegistry();
    const tool: Tool<Record<string, never>, { readonly branch: string }> = {
      name: "GitStatus",
      description: "Get git status.",
      schema: z.object({}),
      execute: vi.fn(async () => ({
        success: true,
        data: {
          branch: "develop",
        },
      })),
    };
    toolRegistry.register(tool);

    const engine = new ExecutionEngine(
      new MalformedDeltaToolCallProvider(),
      toolRegistry,
      new PermissionManager(),
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

    await expect(engine.step(state)).rejects.toThrow(
      "Failed to parse tool call arguments",
    );
  });

  it("should include structured failure data in observation summaries", async () => {
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const toolRegistry = new ToolRegistry();
    const tool: Tool<Record<string, never>, { readonly stdout: string; readonly exitCode: number }> = {
      name: "RunCommand",
      description: "Run a command.",
      schema: z.object({}),
      requiresApproval: () => false,
      execute: vi.fn(async () => ({
        success: false,
        error: "Command exited with code 128",
        data: {
          stdout: "fatal: not a git repository\n",
          exitCode: 128,
        },
      })),
    };
    toolRegistry.register(tool);

    const engine = new ExecutionEngine(
      new ToolCallProvider("RunCommand", "{}"),
      toolRegistry,
      new PermissionManager(),
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

    const observation =
      state.getMemory().thinking.observationSummaries[0]?.summary ?? "";
    expect(observation).toContain("fatal: not a git repository");
  });
});
