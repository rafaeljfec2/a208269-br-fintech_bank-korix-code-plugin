import { describe, expect, it, vi } from "vitest";
import { Logger } from "../../telemetry/logger";
import type { ExecutionContext } from "../types";
import { AgentLoop } from "./agentLoop";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import type { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RecoveryManager } from "./recovery";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import type { RuntimeState } from "./runtimeState";
import type { StepResult } from "./runtimeTypes";

describe("AgentLoop run options", () => {
  it("should initialize runtime state with custom max iterations", async () => {
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const finalStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 0,
      stopReason: "end_turn",
      recoverable: true,
    };
    let observedMaxIterations = 0;
    const step = vi.fn(async (state: RuntimeState) => {
      observedMaxIterations = state.getExecution().maxIterations;
      return finalStep;
    });
    const engine = { step } as unknown as ExecutionEngine;
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const checkpointManager = new CheckpointManager(logger);
    const loop = new AgentLoop(
      engine,
      checkpointManager,
      new RecoveryManager(logger, checkpointManager, eventEmitter),
      new IterationGuard(logger, eventEmitter),
      new CancellationManager(logger, eventEmitter),
      new RuntimeMetrics(logger),
      eventEmitter,
      logger,
    );

    const generator = loop.run("run once", context, undefined, {
      maxIterations: 7,
    });

    while (true) {
      const next = await generator.next();
      if (next.done) {
        break;
      }
    }

    expect(step).toHaveBeenCalledTimes(1);
    expect(observedMaxIterations).toBe(7);
  });

  it("should fail the run when custom timeout is exceeded", async () => {
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const finalStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 0,
      stopReason: "end_turn",
      recoverable: true,
    };
    const step = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return finalStep;
    });
    const engine = { step } as unknown as ExecutionEngine;
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const checkpointManager = new CheckpointManager(logger);
    const loop = new AgentLoop(
      engine,
      checkpointManager,
      new RecoveryManager(logger, checkpointManager, eventEmitter),
      new IterationGuard(logger, eventEmitter),
      new CancellationManager(logger, eventEmitter),
      new RuntimeMetrics(logger),
      eventEmitter,
      logger,
    );

    const generator = loop.run("run once", context, undefined, {
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
    expect(result.error).toContain("timed out");
  });
});
