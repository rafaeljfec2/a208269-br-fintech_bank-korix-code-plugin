import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../../harness/toolRegistry";
import { SubagentRunner } from "./subagentRunner";
import { SUBAGENT_CONFIGS, buildSubagentPrompt } from "./subagentTypes";
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
    "WorkspaceGraph",
    "GetOpenFiles",
    "GetCurrentFile",
    "GitStatus",
    "GitDiff",
    "ChangedFiles",
    "Problems",
    "GetDiagnostics",
    "Glob",
    "WriteFile",
    "EditFile",
    "DeleteFile",
    "RunCommand",
    "Await",
    "TodoWrite",
    "WebFetch",
    "Task",
    "AskUserQuestion",
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
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "WorkspaceGraph",
      "GetOpenFiles",
      "GetCurrentFile",
    ]);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("EditFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("RunCommand")).toBe(false);
  });

  it("should create a plan registry with only read-only planning tools", () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: vi.fn(),
    });

    const registry = runner.createSubagentRegistry(SUBAGENT_CONFIGS.plan);
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual([
      "ReadFile",
      "ListDirectory",
      "Grep",
      "FindReferences",
      "FindSymbols",
      "WorkspaceGraph",
      "GetOpenFiles",
      "GetCurrentFile",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "Glob",
    ]);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("RunCommand")).toBe(false);
    expect(registry.has("Await")).toBe(false);
    expect(registry.has("TodoWrite")).toBe(false);
    expect(registry.has("WebFetch")).toBe(false);
    expect(registry.has("Task")).toBe(false);
  });

  it("should build an SDD/TDD-oriented prompt for plan subagents", () => {
    const prompt = buildSubagentPrompt("plan");

    expect(prompt).toContain("planning subagent");
    expect(prompt).toContain("SDD");
    expect(prompt).toContain("TDD");
    expect(prompt).toContain("implementation plan");
    expect(prompt).toContain("Do not modify files");
  });

  it("should create a review registry with only read-only review tools", () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: vi.fn(),
    });

    const registry = runner.createSubagentRegistry(SUBAGENT_CONFIGS.review);
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual([
      "ReadFile",
      "ListDirectory",
      "Grep",
      "FindReferences",
      "FindSymbols",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "WorkspaceGraph",
      "Glob",
    ]);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("RunCommand")).toBe(false);
    expect(registry.has("Await")).toBe(false);
    expect(registry.has("TodoWrite")).toBe(false);
    expect(registry.has("WebFetch")).toBe(false);
    expect(registry.has("Task")).toBe(false);
    expect(registry.has("AskUserQuestion")).toBe(false);
  });

  it("should build a severity and evidence-oriented prompt for review subagents", () => {
    const prompt = buildSubagentPrompt("review");

    expect(prompt).toContain("code review subagent");
    expect(prompt).toContain("severity");
    expect(prompt).toContain("security");
    expect(prompt).toContain("quality");
    expect(prompt).toContain("evidence");
    expect(prompt).toContain("test gaps");
    expect(prompt).toContain("Do not modify files");
  });

  it("should create a shell registry with only terminal execution tools", () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: vi.fn(),
    });

    const registry = runner.createSubagentRegistry(SUBAGENT_CONFIGS.shell);
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual(["RunCommand", "Await"]);
    expect(registry.has("ReadFile")).toBe(false);
    expect(registry.has("ListDirectory")).toBe(false);
    expect(registry.has("Grep")).toBe(false);
    expect(registry.has("FindReferences")).toBe(false);
    expect(registry.has("FindSymbols")).toBe(false);
    expect(registry.has("GitStatus")).toBe(false);
    expect(registry.has("GitDiff")).toBe(false);
    expect(registry.has("ChangedFiles")).toBe(false);
    expect(registry.has("Problems")).toBe(false);
    expect(registry.has("GetDiagnostics")).toBe(false);
    expect(registry.has("WorkspaceGraph")).toBe(false);
    expect(registry.has("Glob")).toBe(false);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("EditFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("TodoWrite")).toBe(false);
    expect(registry.has("WebFetch")).toBe(false);
    expect(registry.has("Task")).toBe(false);
    expect(registry.has("AskUserQuestion")).toBe(false);
  });

  it("should build an approval-aware prompt for shell subagents", () => {
    const prompt = buildSubagentPrompt("shell");

    expect(prompt).toContain("shell execution subagent");
    expect(prompt).toContain("RunCommand");
    expect(prompt).toContain("Await");
    expect(prompt).toContain("approval");
    expect(prompt).toContain("stdout");
    expect(prompt).toContain("stderr");
    expect(prompt).toContain("exit code");
    expect(prompt).toContain("Do not modify files");
  });

  it("should create a test registry with only test execution tools", () => {
    const runner = new SubagentRunner({
      parentRegistry: createParentRegistry(),
      createRegistry: () => new ToolRegistry(),
      createAgentLoop: vi.fn(),
    });

    const registry = runner.createSubagentRegistry(SUBAGENT_CONFIGS.test);
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual(["RunCommand", "Await", "ReadFile"]);
    expect(registry.has("ListDirectory")).toBe(false);
    expect(registry.has("Grep")).toBe(false);
    expect(registry.has("FindReferences")).toBe(false);
    expect(registry.has("FindSymbols")).toBe(false);
    expect(registry.has("GitStatus")).toBe(false);
    expect(registry.has("GitDiff")).toBe(false);
    expect(registry.has("ChangedFiles")).toBe(false);
    expect(registry.has("Problems")).toBe(false);
    expect(registry.has("GetDiagnostics")).toBe(false);
    expect(registry.has("WorkspaceGraph")).toBe(false);
    expect(registry.has("Glob")).toBe(false);
    expect(registry.has("WriteFile")).toBe(false);
    expect(registry.has("EditFile")).toBe(false);
    expect(registry.has("DeleteFile")).toBe(false);
    expect(registry.has("TodoWrite")).toBe(false);
    expect(registry.has("WebFetch")).toBe(false);
    expect(registry.has("Task")).toBe(false);
    expect(registry.has("AskUserQuestion")).toBe(false);
  });

  it("should build a focused test execution prompt for test subagents", () => {
    const prompt = buildSubagentPrompt("test");

    expect(prompt).toContain("test execution subagent");
    expect(prompt).toContain("RunCommand");
    expect(prompt).toContain("Await");
    expect(prompt).toContain("ReadFile");
    expect(prompt).toContain("pass/fail");
    expect(prompt).toContain("failure details");
    expect(prompt).toContain("verification gaps");
    expect(prompt).toContain("Do not modify files");
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

  it("should pass configured max iterations to the child agent loop", async () => {
    const run = vi.fn(async function* (
      _prompt: string,
      _context: unknown,
      _previousMessages: unknown,
      options: { readonly maxIterations?: number },
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

    expect(run.mock.calls[0]?.[3]?.maxIterations).toBe(5);
  });

  it("should cancel the child agent loop when the parent signal aborts", async () => {
    const controller = new AbortController();
    const cancel = vi.fn(async () => undefined);
    let continueRun: (() => void) | undefined;

    const run = vi.fn(async function* () {
      yield {
        type: "iteration_start",
        iteration: 0,
        timestamp: Date.now(),
      };
      await new Promise<void>((resolve) => {
        continueRun = resolve;
      });
      return {
        success: false,
        error: "Execution was cancelled",
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
            messages: [],
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
      createAgentLoop: () => ({ run, cancel }) as unknown as AgentLoop,
    });

    const resultPromise = runner.run({
      type: "explore",
      prompt: "Find example",
      executionContext: {
        mode: "agent",
        workspaceRoot: "/repo",
        openFiles: [],
      },
      parentSignal: controller.signal,
    });

    await vi.waitFor(() => expect(continueRun).toBeDefined());
    controller.abort();
    continueRun?.();

    const result = await resultPromise;

    expect(cancel).toHaveBeenCalledWith("Parent execution cancelled");
    expect(result.success).toBe(false);
    expect(result.metadata.stopReason).toBe("cancelled");
  });
});
