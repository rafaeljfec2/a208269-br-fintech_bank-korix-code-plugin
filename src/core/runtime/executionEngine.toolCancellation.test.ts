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
import { AgentLoop } from "./agentLoop";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RecoveryManager } from "./recovery";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import type { AgentLoopResult } from "./runtimeTypes";
import { RuntimeState } from "./runtimeState";

const TOOL_NAME = "CaptureSignal";

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

class CapturingTool implements Tool<Record<string, never>, { readonly ok: true }> {
  readonly name = TOOL_NAME;
  readonly description = "Captures the tool context signal";
  readonly schema = z.object({});
  signal: AbortSignal | undefined;

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
    this.signal = context.signal;
    return {
      success: true,
      data: { ok: true as const },
    };
  }
}

class BlockingTool
  implements Tool<Record<string, never>, { readonly aborted: boolean }>
{
  readonly name = TOOL_NAME;
  readonly description = "Waits until the tool context signal is aborted";
  readonly schema = z.object({});
  signal: AbortSignal | undefined;

  requiresApproval(): boolean {
    return false;
  }

  allowedInMode(): boolean {
    return true;
  }

  async execute(
    _input: Record<string, never>,
    context: ToolContext,
  ): Promise<ToolResult<{ readonly aborted: boolean }>> {
    this.signal = context.signal;
    await new Promise<void>((resolve) => {
      context.signal?.addEventListener("abort", () => resolve(), {
        once: true,
      });
      setTimeout(resolve, 50);
    });

    return {
      success: true,
      data: { aborted: context.signal?.aborted ?? false },
    };
  }
}

function createContext(): ExecutionContext {
  return {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  };
}

function createRuntime(tool: Tool): {
  readonly engine: ExecutionEngine;
  readonly loop: AgentLoop;
} {
  const logger = new Logger({ level: "error" });
  const eventEmitter = new RuntimeEventEmitter();
  const checkpointManager = new CheckpointManager(logger);
  const metrics = new RuntimeMetrics(logger);
  const iterationGuard = new IterationGuard(logger, eventEmitter);
  const cancellationManager = new CancellationManager(logger, eventEmitter);
  const recoveryManager = new RecoveryManager(
    logger,
    checkpointManager,
    eventEmitter,
  );
  const registry = new ToolRegistry();
  registry.register(tool);
  const permissionManager = new PermissionManager(async () => ({
    approved: true,
  }));
  const engine = new ExecutionEngine(
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

  return {
    engine,
    loop: new AgentLoop(
      engine,
      checkpointManager,
      recoveryManager,
      iterationGuard,
      cancellationManager,
      metrics,
      eventEmitter,
      logger,
    ),
  };
}

async function consumeRun(loop: AgentLoop): Promise<AgentLoopResult> {
  const generator = loop.run("use the tool", createContext(), undefined, {
    timeoutMs: 5,
  });

  while (true) {
    const next = await generator.next();
    if (next.done) {
      return next.value;
    }
  }
}

describe("ExecutionEngine tool cancellation propagation", () => {
  it("should pass a scheduler abort signal to tool context", async () => {
    const tool = new CapturingTool();
    const { engine } = createRuntime(tool);
    const state = new RuntimeState(createContext(), 1);

    await engine.step(state);

    expect(tool.signal).toBeInstanceOf(AbortSignal);
    expect(tool.signal?.aborted).toBe(false);
  });

  it("should abort tool-visible signal when agent loop times out", async () => {
    const tool = new BlockingTool();
    const { loop } = createRuntime(tool);

    const result = await consumeRun(loop);

    expect(result.success).toBe(false);
    expect(tool.signal).toBeInstanceOf(AbortSignal);
    expect(tool.signal?.aborted).toBe(true);
  });
});
