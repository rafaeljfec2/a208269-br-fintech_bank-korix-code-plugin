import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../../harness/toolRegistry";
import type { AgentLoop } from "../runtime/agentLoop";
import { SubagentRunner } from "./subagentRunner";

const createTool = (name: string): Tool<Record<string, never>, string> => ({
  name,
  description: `${name} test tool`,
  schema: z.object({}),
  async execute() {
    return { success: true, data: name };
  },
});

function createParentRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const name of ["RunCommand", "Await", "ReadFile"]) {
    registry.register(createTool(name));
  }
  return registry;
}

function createAgentLoopResult(options: {
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly toolsCalled: readonly string[];
  readonly error?: string;
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
        ...(options.error ? { error: options.error } : {}),
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
              result: "tool output",
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

function createRunner(agentLoop: AgentLoop): SubagentRunner {
  return new SubagentRunner({
    parentRegistry: createParentRegistry(),
    createRegistry: () => new ToolRegistry(),
    createAgentLoop: () => agentLoop,
  });
}

describe("SubagentRunner resource limits", () => {
  it("should fail when tool calls exceed the configured limit", async () => {
    const runner = createRunner(
      createAgentLoopResult({
        success: true,
        output: "done",
        iterations: 1,
        toolsCalled: Array.from({ length: 9 }, () => "RunCommand"),
      }),
    );

    const result = await runner.run({
      type: "shell",
      prompt: "Run commands",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.metadata.limitExceeded).toBe("tool_calls");
    expect(result.metadata.stopReason).toBe("tool_calls");
  });

  it("should fail when aggregate output exceeds the configured limit", async () => {
    const runner = createRunner(
      createAgentLoopResult({
        success: true,
        output: "x".repeat(70_000),
        iterations: 1,
        toolsCalled: ["ReadFile"],
      }),
    );

    const result = await runner.run({
      type: "test",
      prompt: "Run tests",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.metadata.limitExceeded).toBe("output_bytes");
    expect(result.metadata.stopReason).toBe("output_bytes");
  });

  it("should keep normal runs successful when within limits", async () => {
    const runner = createRunner(
      createAgentLoopResult({
        success: true,
        output: "ok",
        iterations: 1,
        toolsCalled: ["ReadFile"],
      }),
    );

    const result = await runner.run({
      type: "test",
      prompt: "Run tests",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.metadata.limitExceeded).toBeUndefined();
    expect(result.metadata.stopReason).toBe("completed");
  });

  it("should preserve timeout stop reason metadata", async () => {
    const runner = createRunner(
      createAgentLoopResult({
        success: false,
        output: "",
        iterations: 1,
        toolsCalled: [],
        error: "Execution timed out after 300000ms",
      }),
    );

    const result = await runner.run({
      type: "shell",
      prompt: "Run command",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.metadata.stopReason).toBe("timeout");
  });
});
