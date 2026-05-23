import { describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";
import { ToolRegistry, globalToolRegistry } from "../harness/toolRegistry";
import { TaskTool } from "./task";

vi.mock("../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { registerAllTools } from "./index";

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("TaskTool", () => {
  it("should accept supported subagent tasks in the schema", () => {
    expect(
      TaskTool.schema.safeParse({ type: "explore", prompt: "Find auth" })
        .success,
    ).toBe(true);
    expect(
      TaskTool.schema.safeParse({ type: "plan", prompt: "Plan auth fix" })
        .success,
    ).toBe(true);
    expect(
      TaskTool.schema.safeParse({ type: "review", prompt: "Review auth fix" })
        .success,
    ).toBe(true);
    expect(
      TaskTool.schema.safeParse({ type: "shell", prompt: "Run git status" })
        .success,
    ).toBe(true);
    expect(
      TaskTool.schema.safeParse({ type: "test", prompt: "Run tests" }).success,
    ).toBe(true);
  });

  it("should only be available in agent mode", () => {
    expect(TaskTool.allowedInMode?.("ask")).toBe(false);
    expect(TaskTool.allowedInMode?.("plan")).toBe(false);
    expect(TaskTool.allowedInMode?.("agent")).toBe(true);
  });

  it("should return a structured failure when subagents are unavailable", async () => {
    const result = await TaskTool.execute(
      { type: "explore", prompt: "Find auth" },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("unavailable");
  });

  it("should call the runtime subagent callback", async () => {
    const controller = new AbortController();
    const runSubagent = vi.fn(async () => ({
      success: true,
      output: "Found src/auth.ts",
      iterations: 1,
      duration: 10,
      metadata: {
        toolsCalled: ["ReadFile"],
      },
    }));

    const result = await TaskTool.execute(
      { type: "explore", prompt: "Find auth" },
      createMockToolContext({ runSubagent, signal: controller.signal }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      type: "explore",
      success: true,
      output: "Found src/auth.ts",
      iterations: 1,
      duration: 10,
      error: undefined,
      metadata: {
        toolsCalled: ["ReadFile"],
      },
    });
    expect(runSubagent).toHaveBeenCalledWith({
      type: "explore",
      prompt: "Find auth",
      context: undefined,
      executionContext: expect.objectContaining({ mode: "agent" }),
      parentSignal: controller.signal,
    });
  });

  it("should call the runtime subagent callback for plan tasks", async () => {
    const runSubagent = vi.fn(async () => ({
      success: true,
      output: "Plan:\n1. Write Red tests\n2. Implement Green",
      iterations: 1,
      duration: 10,
      metadata: {
        toolsCalled: ["ReadFile", "Grep"],
      },
    }));

    const result = await TaskTool.execute(
      { type: "plan", prompt: "Plan auth fix" },
      createMockToolContext({ runSubagent }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      type: "plan",
      output: "Plan:\n1. Write Red tests\n2. Implement Green",
    });
    expect(runSubagent).toHaveBeenCalledWith({
      type: "plan",
      prompt: "Plan auth fix",
      context: undefined,
      executionContext: expect.objectContaining({ mode: "agent" }),
    });
  });

  it("should call the runtime subagent callback for review tasks", async () => {
    const runSubagent = vi.fn(async () => ({
      success: true,
      output: "Findings:\n- high src/auth.ts:12 missing authorization check",
      iterations: 1,
      duration: 10,
      metadata: {
        toolsCalled: ["GitDiff", "ReadFile"],
      },
    }));

    const result = await TaskTool.execute(
      { type: "review", prompt: "Review auth fix" },
      createMockToolContext({ runSubagent }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      type: "review",
      output: "Findings:\n- high src/auth.ts:12 missing authorization check",
    });
    expect(runSubagent).toHaveBeenCalledWith({
      type: "review",
      prompt: "Review auth fix",
      context: undefined,
      executionContext: expect.objectContaining({ mode: "agent" }),
    });
  });

  it("should call the runtime subagent callback for shell tasks", async () => {
    const runSubagent = vi.fn(async () => ({
      success: true,
      output: "Command succeeded\nexit code: 0",
      iterations: 1,
      duration: 10,
      metadata: {
        toolsCalled: ["RunCommand"],
      },
    }));

    const result = await TaskTool.execute(
      { type: "shell", prompt: "Run git status" },
      createMockToolContext({ runSubagent }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      type: "shell",
      output: "Command succeeded\nexit code: 0",
    });
    expect(runSubagent).toHaveBeenCalledWith({
      type: "shell",
      prompt: "Run git status",
      context: undefined,
      executionContext: expect.objectContaining({ mode: "agent" }),
    });
  });

  it("should call the runtime subagent callback for test tasks", async () => {
    const runSubagent = vi.fn(async () => ({
      success: true,
      output: "Tests passed\ncommand: pnpm exec vitest run src/auth.test.ts",
      iterations: 1,
      duration: 10,
      metadata: {
        toolsCalled: ["RunCommand", "ReadFile"],
      },
    }));

    const result = await TaskTool.execute(
      { type: "test", prompt: "Run auth tests" },
      createMockToolContext({ runSubagent }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      type: "test",
      output: "Tests passed\ncommand: pnpm exec vitest run src/auth.test.ts",
    });
    expect(runSubagent).toHaveBeenCalledWith({
      type: "test",
      prompt: "Run auth tests",
      context: undefined,
      executionContext: expect.objectContaining({ mode: "agent" }),
    });
  });

  it("should be registered and not cached", async () => {
    resetGlobalRegistry();
    registerAllTools();
    expect(globalToolRegistry.has("Task")).toBe(true);

    const runSubagent = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        output: "one",
        iterations: 1,
        duration: 1,
        metadata: { toolsCalled: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        output: "two",
        iterations: 1,
        duration: 1,
        metadata: { toolsCalled: [] },
      });

    const registry = new ToolRegistry();
    registry.register(TaskTool);
    const context = createMockToolContext({ runSubagent });

    const first = await registry.execute(
      "Task",
      { type: "explore", prompt: "Find auth" },
      context,
    );
    const second = await registry.execute(
      "Task",
      { type: "explore", prompt: "Find auth" },
      context,
    );

    expect(first.data).toMatchObject({ output: "one" });
    expect(second.data).toMatchObject({ output: "two" });
    expect(first.metadata?.cached).toBe(false);
    expect(second.metadata?.cached).toBe(false);
  });
});
