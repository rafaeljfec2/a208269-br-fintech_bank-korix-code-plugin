import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../../harness/toolRegistry";
import type { AgentLoop } from "../runtime/agentLoop";
import { SubagentRunner } from "./subagentRunner";

const createTool = (
  name: string,
): Tool<{ readonly value?: string }, string> => ({
  name,
  description: `${name} test tool`,
  schema: z.object({ value: z.string().optional() }),
  async execute() {
    return { success: true, data: name };
  },
});

function createParentRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const name of ["ReadFile", "GitDiff"]) {
    registry.register(createTool(name));
  }
  return registry;
}

function createAgentLoopResult(options: {
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly toolsCalled: readonly string[];
}): AgentLoop {
  return {
    async *run() {
      yield {
        type: "iteration_start",
        iteration: 0,
        timestamp: Date.now(),
      };
      return {
        success: options.success,
        iterations: options.iterations,
        metrics: {
          totalTokens: 0,
          totalToolCalls: options.toolsCalled.length,
          iterations: options.iterations,
          duration: 10,
          checkpoints: 0,
          recoveries: 0,
          toolBreakdown: {},
          eventTimeline: [],
        },
        finalState: {
          conversation: {
            messages: [
              {
                role: "assistant",
                content: options.output,
                timestamp: Date.now(),
              },
            ],
            turnCount: 1,
            toolCallHistory: options.toolsCalled.map((toolName, index) => ({
              id: `tool-${index + 1}`,
              toolName,
              input: {},
              result: "",
              success: true,
              duration: 1,
              timestamp: Date.now(),
            })),
          },
          execution: {
            isExecuting: false,
            currentIteration: options.iterations,
            maxIterations: 10,
            startTime: 0,
            lastActivityTime: 0,
          },
          workspace: {
            root: "/repo",
            openFiles: [],
            modifiedFiles: new Set(),
          },
          memory: {
            shortTerm: new Map(),
            conversationContext: [],
          },
          correlationId: "corr-1",
        },
      };
    },
  } as unknown as AgentLoop;
}

describe("SubagentRunner metrics", () => {
  it("should record metrics for successful subagent runs", async () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () =>
        createAgentLoopResult({
          success: true,
          output: "Review complete",
          iterations: 3,
          toolsCalled: ["GitDiff", "ReadFile", "GitDiff"],
        }),
    });

    await runner.run({
      type: "review",
      prompt: "Review changes",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    const metrics = runner.getMetrics();

    expect(metrics.totalRuns).toBe(1);
    expect(metrics.successfulRuns).toBe(1);
    expect(metrics.failedRuns).toBe(0);
    expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
    expect(metrics.totalIterations).toBe(3);
    expect(metrics.runsByType.review).toBe(1);
    expect(metrics.toolUsage).toEqual({
      GitDiff: 2,
      ReadFile: 1,
    });
  });

  it("should record metrics for failed subagent runs", async () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () =>
        ({
          async *run() {
            throw new Error("provider failed");
          },
        }) as unknown as AgentLoop,
    });

    const result = await runner.run({
      type: "plan",
      prompt: "Plan changes",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    const metrics = runner.getMetrics();

    expect(result.success).toBe(false);
    expect(metrics.totalRuns).toBe(1);
    expect(metrics.successfulRuns).toBe(0);
    expect(metrics.failedRuns).toBe(1);
    expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
    expect(metrics.totalIterations).toBe(0);
    expect(metrics.runsByType.plan).toBe(1);
    expect(metrics.toolUsage).toEqual({});
  });

  it("should return metrics snapshots without exposing internal state", async () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () =>
        createAgentLoopResult({
          success: true,
          output: "Found src/example.ts",
          iterations: 1,
          toolsCalled: ["ReadFile"],
        }),
    });

    await runner.run({
      type: "explore",
      prompt: "Find example",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    const firstSnapshot = runner.getMetrics();
    const mutableRunsByType = firstSnapshot.runsByType as Record<
      string,
      number
    >;
    const mutableToolUsage = firstSnapshot.toolUsage as Record<string, number>;

    mutableRunsByType.explore = 99;
    mutableToolUsage.ReadFile = 99;

    const secondSnapshot = runner.getMetrics();

    expect(secondSnapshot.runsByType.explore).toBe(1);
    expect(secondSnapshot.toolUsage.ReadFile).toBe(1);
  });
});
