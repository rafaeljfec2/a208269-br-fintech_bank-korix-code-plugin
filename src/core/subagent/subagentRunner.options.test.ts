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
  registry.register(createTool("RunCommand"));
  registry.register(createTool("Await"));
  return registry;
}

describe("SubagentRunner run options", () => {
  it("should pass configured timeout to the child agent loop", async () => {
    const run = vi.fn(async function* (
      _prompt: string,
      _context: unknown,
      _previousMessages: unknown,
      options: { readonly timeoutMs?: number },
    ) {
      yield {
        type: "iteration_start",
        iteration: 0,
        timestamp: Date.now(),
      };
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
                role: "assistant",
                content: "ok",
                timestamp: Date.now(),
              },
            ],
            turnCount: 1,
            toolCallHistory: [],
          },
          execution: {
            isExecuting: false,
            currentIteration: 1,
            maxIterations: 5,
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
    });

    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: () => ({ run }) as unknown as AgentLoop,
    });

    await runner.run({
      type: "shell",
      prompt: "Run command",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(run.mock.calls[0]?.[3]?.timeoutMs).toBe(300_000);
  });
});
