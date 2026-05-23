import { describe, expect, it, vi } from "vitest";
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
  for (const name of ["ReadFile", "Grep", "RunCommand", "Await"]) {
    registry.register(createTool(name));
  }
  return registry;
}

function createSuccessResult(output = "ok") {
  return {
    success: true,
    iterations: 1,
    metrics: {
      totalTokens: 0,
      totalToolCalls: 0,
      iterations: 1,
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
            role: "assistant" as const,
            content: output,
            timestamp: Date.now(),
          },
        ],
        turnCount: 1,
        toolCallHistory: [],
      },
      execution: {
        isExecuting: false,
        currentIteration: 1,
        maxIterations: 10,
        startTime: 0,
        lastActivityTime: 0,
      },
      workspace: {
        root: "/repo",
        openFiles: [],
        modifiedFiles: new Set<string>(),
      },
      memory: {
        shortTerm: new Map<string, unknown>(),
        conversationContext: [],
      },
      correlationId: "corr-1",
    },
  };
}

describe("SubagentRunner phase 6 capabilities", () => {
  it("should forward child loop progress events to the parent callback", async () => {
    const onEvent = vi.fn();
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () =>
        ({
          async *run() {
            yield {
              type: "iteration_start",
              iteration: 0,
              timestamp: Date.now(),
            };
            yield {
              type: "tool_call",
              id: "tool-1",
              name: "ReadFile",
              input: { path: "src/index.ts" },
              timestamp: Date.now(),
            };
            yield {
              type: "iteration_complete",
              iteration: 0,
              hadToolCalls: true,
              duration: 5,
              timestamp: Date.now(),
            };
            return createSuccessResult();
          },
        }) as unknown as AgentLoop,
    });

    await runner.run({
      type: "explore",
      prompt: "Find code",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
      onEvent,
    });

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subagentType: "explore",
        eventType: "tool_call",
        event: expect.objectContaining({ name: "ReadFile" }),
      }),
    );
  });

  it("should reuse pooled registries for repeated runs of the same subagent type", async () => {
    const createRegistry = vi.fn(() => new ToolRegistry());
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry,
      createAgentLoop: () =>
        ({
          async *run() {
            yield {
              type: "iteration_start",
              iteration: 0,
              timestamp: Date.now(),
            };
            return createSuccessResult();
          },
        }) as unknown as AgentLoop,
    });

    const request = {
      type: "explore" as const,
      prompt: "Find code",
      executionContext: {
        mode: "agent" as const,
        workspaceRoot: "/repo",
        openFiles: [],
      },
    };

    await runner.run(request);
    await runner.run(request);

    expect(createRegistry).toHaveBeenCalledTimes(1);
  });

  it("should retry transient subagent failures once", async () => {
    const createAgentLoop = vi
      .fn()
      .mockReturnValueOnce({
        async *run() {
          throw new Error("ECONNRESET");
        },
      } as unknown as AgentLoop)
      .mockReturnValueOnce({
        async *run() {
          yield {
            type: "iteration_start",
            iteration: 0,
            timestamp: Date.now(),
          };
          return createSuccessResult("recovered");
        },
      } as unknown as AgentLoop);

    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop,
    });

    const result = await runner.run({
      type: "explore",
      prompt: "Find code",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("recovered");
    expect(result.metadata.recoveryAttempts).toBe(1);
  });

  it("should report recovery attempts when transient failures persist", async () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () =>
        ({
          async *run() {
            throw new Error("temporarily unavailable");
          },
        }) as unknown as AgentLoop,
    });

    const result = await runner.run({
      type: "explore",
      prompt: "Find code",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.metadata.stopReason).toBe("runtime_error");
    expect(result.metadata.recoveryAttempts).toBe(1);
  });
});
