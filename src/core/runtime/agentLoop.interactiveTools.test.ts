import { describe, expect, it, vi } from "vitest";
import { Logger } from "../../telemetry/logger";
import { AgentLoop } from "./agentLoop";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import type { ExecutionEngine } from "./executionEngine";
import { IterationGuard } from "./iterationGuard";
import { RecoveryManager } from "./recovery";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeMetrics } from "./runtimeMetrics";
import type { AgentLoopResult, StepResult } from "./runtimeTypes";
import type { ExecutionContext } from "../types";
import type { RuntimeEvent } from "./runtimeEvents";
import type { RuntimeState } from "./runtimeState";
import type { ExecutionStepOptions } from "./executionEngine";

describe("AgentLoop interactive tools", () => {
  it("should continue one iteration after an interactive tool returns user input", async () => {
    const context: ExecutionContext = {
      mode: "ask",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const firstStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: true,
      hadThinking: false,
      tokenCount: 0,
      stopReason: "end_turn",
      recoverable: true,
    };
    const finalStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 12,
      stopReason: "end_turn",
      recoverable: true,
    };
    const step = vi
      .fn<[], Promise<StepResult>>()
      .mockResolvedValueOnce(firstStep)
      .mockResolvedValueOnce(finalStep);
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

    const events: RuntimeEvent[] = [];
    const generator = loop.run("choose a database", context);
    let result: AgentLoopResult | undefined;

    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(step).toHaveBeenCalledTimes(2);
    expect(
      events.filter((event) => event.type === "iteration_start"),
    ).toHaveLength(2);
    expect(result?.iterations).toBe(2);
  });

  it("should finish without a provider follow-up when an interactive tool supplies a final response", async () => {
    const context: ExecutionContext = {
      mode: "ask",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const firstStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: true,
      completeAfterInteractiveToolCalls: true,
      syntheticResponse: "Resposta registrada: rock.",
      hadThinking: false,
      tokenCount: 0,
      stopReason: "end_turn",
      recoverable: true,
    };
    const step = vi.fn<[], Promise<StepResult>>().mockResolvedValue(firstStep);
    const engine = { step } as unknown as ExecutionEngine;
    const logger = new Logger({ level: "error" });
    const eventEmitter = new RuntimeEventEmitter();
    const emittedEvents: RuntimeEvent[] = [];
    eventEmitter.onEvent((event) => emittedEvents.push(event));
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

    const generator = loop.run("me faça uma pergunta com 4 opções", context);
    let result: AgentLoopResult | undefined;

    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    expect(step).toHaveBeenCalledTimes(1);
    expect(result?.iterations).toBe(1);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({
        type: "token",
        content: "Resposta registrada: rock.",
      }),
    );
  });

  it("should retry once when required tools are unsatisfied, then complete", async () => {
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const unsatisfiedStep: StepResult = {
      hadToolCalls: false,
      requiredToolSatisfied: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 10,
      stopReason: "end_turn",
      recoverable: true,
    };
    const step = vi
      .fn<
        [state: RuntimeState, options?: ExecutionStepOptions],
        Promise<StepResult>
      >()
      .mockResolvedValueOnce(unsatisfiedStep)
      .mockResolvedValueOnce(unsatisfiedStep);
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

    const events: RuntimeEvent[] = [];
    const generator = loop.run("leia arquivo.ts", context, undefined, {
      toolUsePolicy: {
        mode: "required",
        allowedTools: ["ReadFile"],
        evidenceRequired: true,
        allowPassiveEvidence: false,
        reason: "workspace_read",
      },
    });
    let result: AgentLoopResult | undefined;

    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(step).toHaveBeenCalledTimes(2);
    expect(step.mock.calls[0]?.[1]?.toolUsePolicy?.mode).toBe("required");
    expect(
      events.filter((event) => event.type === "iteration_start"),
    ).toHaveLength(2);
    expect(result?.iterations).toBe(2);
  });

  it("should allow a final answer after required tools are satisfied", async () => {
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const requiredToolStep: StepResult = {
      hadToolCalls: true,
      requiredToolSatisfied: true,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 10,
      stopReason: "end_turn",
      recoverable: true,
    };
    const finalAnswerStep: StepResult = {
      hadToolCalls: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 10,
      stopReason: "end_turn",
      recoverable: true,
    };
    const step = vi
      .fn<
        [state: RuntimeState, options?: ExecutionStepOptions],
        Promise<StepResult>
      >()
      .mockResolvedValueOnce(requiredToolStep)
      .mockResolvedValueOnce(finalAnswerStep);
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

    const generator = loop.run("leia arquivo.ts", context, undefined, {
      toolUsePolicy: {
        mode: "required",
        allowedTools: ["ReadFile"],
        evidenceRequired: true,
        allowPassiveEvidence: false,
        reason: "workspace_read",
      },
    });
    let result: AgentLoopResult | undefined;

    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    expect(step).toHaveBeenCalledTimes(2);
    expect(step.mock.calls[0]?.[1]?.toolUsePolicy?.mode).toBe("required");
    expect(step.mock.calls[1]?.[1]?.toolUsePolicy?.mode).toBe("auto");
    expect(result?.iterations).toBe(2);
  });

  it("should discard buffered text from an unsatisfied required-tool repair attempt", async () => {
    const context: ExecutionContext = {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    };
    const unsatisfiedStep: StepResult = {
      hadToolCalls: false,
      requiredToolSatisfied: false,
      hadInteractiveToolCalls: false,
      hadThinking: false,
      tokenCount: 10,
      stopReason: "end_turn",
      recoverable: true,
    };
    const eventEmitter = new RuntimeEventEmitter();
    eventEmitter.beginResponseBuffering();
    const step = vi
      .fn<
        [state: RuntimeState, options?: ExecutionStepOptions],
        Promise<StepResult>
      >()
      .mockImplementationOnce(async () => {
        eventEmitter.emitEvent({
          type: "token",
          content: "stale answer",
          timestamp: Date.now(),
        });
        return unsatisfiedStep;
      })
      .mockResolvedValueOnce(unsatisfiedStep);
    const engine = { step } as unknown as ExecutionEngine;
    const logger = new Logger({ level: "error" });
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

    const generator = loop.run("leia arquivo.ts", context, undefined, {
      toolUsePolicy: {
        mode: "required",
        allowedTools: ["ReadFile"],
        evidenceRequired: true,
        allowPassiveEvidence: false,
        reason: "workspace_read",
      },
    });

    while (true) {
      const next = await generator.next();
      if (next.done) {
        break;
      }
    }

    expect(eventEmitter.getBufferedResponse()).toBe("");
  });
});
