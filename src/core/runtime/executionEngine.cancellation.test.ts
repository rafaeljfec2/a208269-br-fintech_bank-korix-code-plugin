import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  ProviderConfig,
  ProviderEvent,
  ProviderInput,
  ProviderMetadata,
  RequestContext,
} from "../providers/types";
import type { ExecutionContext } from "../types";
import { PermissionManager } from "../../harness/permissions";
import { ToolRegistry } from "../../harness/toolRegistry";
import { Logger } from "../../telemetry/logger";
import { AgentLoop } from "./agentLoop";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RecoveryManager } from "./recovery";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import { RuntimeState } from "./runtimeState";

class CapturingProvider implements AIProvider {
  readonly type = "test";
  readonly config: ProviderConfig = {
    type: "test",
    apiKey: "test",
    model: "test-model",
  };
  signal: AbortSignal | undefined;

  async *send(
    _input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    this.signal = context.signal;
    yield {
      type: "finish",
      reason: "end_turn",
      timestamp: Date.now(),
      correlation: {
        correlationId: context.correlationId,
        sessionId: context.sessionId,
        agentRunId: context.agentRunId,
        iterationId: context.iterationId,
      },
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

class BlockingProvider implements AIProvider {
  readonly type = "test";
  readonly config: ProviderConfig = {
    type: "test",
    apiKey: "test",
    model: "test-model",
  };
  signal: AbortSignal | undefined;

  async *send(
    _input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    this.signal = context.signal;
    await new Promise<void>((resolve) => {
      context.signal?.addEventListener("abort", () => resolve(), {
        once: true,
      });
      setTimeout(resolve, 50);
    });
    yield {
      type: "finish",
      reason: "end_turn",
      timestamp: Date.now(),
      correlation: {
        correlationId: context.correlationId,
        sessionId: context.sessionId,
        agentRunId: context.agentRunId,
        iterationId: context.iterationId,
      },
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

function createRuntime(provider: AIProvider): {
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
  const engine = new ExecutionEngine(
    provider,
    new ToolRegistry(),
    new PermissionManager(),
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

function createContext(): ExecutionContext {
  return {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  };
}

describe("ExecutionEngine cancellation propagation", () => {
  it("should pass runtime abort signal to provider request context", async () => {
    const provider = new CapturingProvider();
    const { engine } = createRuntime(provider);
    const state = new RuntimeState(createContext(), 1);
    state.addMessage({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    });
    state.startExecution();

    await engine.step(state);

    expect(provider.signal).toBeInstanceOf(AbortSignal);
    expect(provider.signal?.aborted).toBe(false);
  });

  it("should abort provider-visible signal when agent loop times out", async () => {
    const provider = new BlockingProvider();
    const { loop } = createRuntime(provider);
    const generator = loop.run("hello", createContext(), undefined, {
      timeoutMs: 5,
    });

    let result;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    expect(result.success).toBe(false);
    expect(provider.signal).toBeInstanceOf(AbortSignal);
    expect(provider.signal?.aborted).toBe(true);
  });
});
