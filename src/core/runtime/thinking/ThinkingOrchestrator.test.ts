import { describe, expect, it } from "vitest";
import { Logger } from "../../../telemetry/logger";
import { RuntimeEventEmitter } from "../runtimeEvents";
import { RuntimeState } from "../runtimeState";
import type { AgentLoopResult } from "../runtimeTypes";
import type { RuntimeEvent } from "../runtimeEvents";
import { ThinkingOrchestrator, type AgentLoopLike } from "./ThinkingOrchestrator";
import type { ThinkingRunInput } from "./types";

describe("ThinkingOrchestrator", () => {
  it("should validate and flush workspace responses after supervised execution", async () => {
    const context: ThinkingRunInput["context"] = {
      mode: "plan",
      workspaceRoot: "/workspace",
      openFiles: ["/workspace/src/app.ts"],
    };

    const eventEmitter = new RuntimeEventEmitter();
    const emittedEvents: RuntimeEvent[] = [];
    eventEmitter.onEvent((event) => emittedEvents.push(event));

    const agentLoop: AgentLoopLike = {
      async *run(): AsyncGenerator<RuntimeEvent, AgentLoopResult> {
        eventEmitter.emitEvent({
          type: "token",
          content: "This is a concise answer.",
          timestamp: Date.now(),
        });

        yield {
          type: "done",
          stopReason: "end_turn",
          timestamp: Date.now(),
        };

        const state = new RuntimeState(context, 25);
        return {
          success: true,
          iterations: 1,
          finalState: state.createSnapshot(),
          metrics: {
            totalTokens: 1,
            totalToolCalls: 0,
            iterations: 1,
            duration: 1,
            checkpoints: 0,
            recoveries: 0,
            toolBreakdown: {},
            eventTimeline: [],
          },
        };
      },
    };

    const orchestrator = new ThinkingOrchestrator({
      agentLoop,
      eventEmitter,
      logger: new Logger({ level: "error" }),
      evidenceProvider: async () => ({
        summary: "1 workspace item, 20 estimated tokens.",
        providerContext: "src/app.ts",
        items: [
          {
            path: "/workspace/src/app.ts",
            priority: 1,
            tokenCount: 20,
          },
        ],
        totalTokens: 20,
      }),
    });

    const yieldedEvents: RuntimeEvent[] = [];
    const generator = orchestrator.run({
      initialMessage: "explique esse arquivo",
      context,
    });

    let result: AgentLoopResult | undefined;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
      yieldedEvents.push(next.value);
    }

    const validationIndex = emittedEvents.findIndex(
      (event) => event.type === "response_validation",
    );
    const tokenIndex = emittedEvents.findIndex((event) => event.type === "token");

    expect(yieldedEvents.some((event) => event.type === "done")).toBe(true);
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(tokenIndex).toBeGreaterThan(validationIndex);
    expect(result?.finalState.memory.thinking?.validationResult?.status).toBe(
      "passed",
    );
    expect(result?.finalState.memory.thinking?.executionGraph?.nodes.length).toBeGreaterThan(0);
  });

  it("should stream low-risk general answers before final validation", async () => {
    const context: ThinkingRunInput["context"] = {
      mode: "ask",
      workspaceRoot: "/workspace",
      openFiles: [],
    };

    const eventEmitter = new RuntimeEventEmitter();
    const emittedEvents: RuntimeEvent[] = [];
    eventEmitter.onEvent((event) => emittedEvents.push(event));

    const agentLoop: AgentLoopLike = {
      async *run(): AsyncGenerator<RuntimeEvent, AgentLoopResult> {
        eventEmitter.emitEvent({
          type: "token",
          content: "Streaming answer.",
          timestamp: Date.now(),
        });

        yield {
          type: "done",
          stopReason: "end_turn",
          timestamp: Date.now(),
        };

        const state = new RuntimeState(context, 25);
        return {
          success: true,
          iterations: 1,
          finalState: state.createSnapshot(),
          metrics: {
            totalTokens: 1,
            totalToolCalls: 0,
            iterations: 1,
            duration: 1,
            checkpoints: 0,
            recoveries: 0,
            toolBreakdown: {},
            eventTimeline: [],
          },
        };
      },
    };

    const orchestrator = new ThinkingOrchestrator({
      agentLoop,
      eventEmitter,
      logger: new Logger({ level: "error" }),
    });

    const generator = orchestrator.run({
      initialMessage: "hello briefly",
      context,
    });

    while (true) {
      const next = await generator.next();
      if (next.done) {
        break;
      }
    }

    const validationIndex = emittedEvents.findIndex(
      (event) => event.type === "response_validation",
    );
    const tokenIndex = emittedEvents.findIndex((event) => event.type === "token");

    expect(tokenIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeGreaterThan(tokenIndex);
  });
});
