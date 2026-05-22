import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../../harness/toolRegistry";
import { SubagentRunner } from "./subagentRunner";
import { SUBAGENT_CONFIGS } from "./subagentTypes";
import type { AgentLoop } from "../runtime/agentLoop";

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
  for (const name of [
    "ReadFile",
    "Grep",
    "FindReferences",
    "FindSymbols",
    "ListDirectory",
    "WriteFile",
    "DeleteFile",
    "RunCommand",
  ]) {
    registry.register(createTool(name));
  }
  return registry;
}

describe("SubagentRunner", () => {
  it("should create an isolated registry with only allowed available tools", () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: vi.fn(),
    });

    const registry = runner.createSubagentRegistry(SUBAGENT_CONFIGS.explore);
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual([
      "ReadFile",
      "ListDirectory",
      "Grep",
      "FindReferences",
      "FindSymbols",
    ]);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("RunCommand")).toBe(false);
  });

  it("should run an explore subagent and return final assistant output", async () => {
    const createAgentLoop = vi.fn(
      (_registry: ToolRegistry, _prompt: string) => {
        return {
          async *run() {
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
                totalToolCalls: 1,
                iterations: 1,
                duration: 10,
                checkpoints: 0,
                recoveries: 0,
                toolBreakdown: { ReadFile: 1 },
                eventTimeline: [],
              },
              finalState: {
                conversation: {
                  messages: [
                    {
                      role: "assistant",
                      content: "Found src/example.ts",
                      timestamp: Date.now(),
                    },
                  ],
                  turnCount: 1,
                  toolCallHistory: [
                    {
                      id: "tool-1",
                      toolName: "ReadFile",
                      input: { path: "src/example.ts" },
                      result: "content",
                      success: true,
                      duration: 1,
                      timestamp: Date.now(),
                    },
                  ],
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
      },
    );

    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop,
    });

    const result = await runner.run({
      type: "explore",
      prompt: "Find example",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("Found src/example.ts");
    expect(result.metadata.toolsCalled).toEqual(["ReadFile"]);
  });
});
