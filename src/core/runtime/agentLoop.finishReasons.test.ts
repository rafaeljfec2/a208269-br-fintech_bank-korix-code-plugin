import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../harness/permissions";
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
import type { RuntimeEvent } from "./runtimeEvents";

class MaxTokensProvider implements AIProvider {
  readonly type = "test";
  readonly config: ProviderConfig = {
    type: "test",
    apiKey: "test",
    model: "test-model",
  };
  calls = 0;

  async *send(
    _input: ProviderInput,
    context: RequestContext,
  ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
    this.calls++;
    const correlation = {
      correlationId: context.correlationId,
      sessionId: context.sessionId,
      agentRunId: context.agentRunId,
      iterationId: context.iterationId,
    };

    yield {
      type: "token",
      value: "partial",
      timestamp: Date.now(),
      correlation,
    };
    yield {
      type: "finish",
      reason: "max_tokens",
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

function createContext(): ExecutionContext {
  return {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  };
}

describe("AgentLoop finish reasons", () => {
  it("should not retry provider calls after max_tokens without tool calls", async () => {
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
    const provider = new MaxTokensProvider();
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
    const loop = new AgentLoop(
      engine,
      checkpointManager,
      recoveryManager,
      iterationGuard,
      cancellationManager,
      metrics,
      eventEmitter,
      logger,
    );
    const events: RuntimeEvent[] = [];

    for await (const event of loop.run("finish safely", createContext(), [], {
      maxIterations: 3,
    })) {
      events.push(event);
    }

    expect(provider.calls).toBe(1);
    expect(
      events.filter((event) => event.type === "iteration_complete"),
    ).toHaveLength(1);
  });
});

