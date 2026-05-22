import { describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";
import { ToolRegistry, globalToolRegistry } from "../harness/toolRegistry";
import { TodoWriteTool } from "./todoWrite";

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

describe("TodoWriteTool", () => {
  it("should reject multiple in-progress todos", async () => {
    const result = await TodoWriteTool.execute(
      {
        todos: [
          {
            content: "Write tests",
            status: "in_progress",
            activeForm: "Writing tests",
          },
          {
            content: "Implement feature",
            status: "in_progress",
            activeForm: "Implementing feature",
          },
        ],
      },
      createMockToolContext({
        updateTodos: vi.fn(),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only one");
  });

  it("should return structured failure when runtime todo state is unavailable", async () => {
    const result = await TodoWriteTool.execute(
      {
        todos: [
          {
            content: "Write tests",
            status: "in_progress",
            activeForm: "Writing tests",
          },
        ],
      },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("unavailable");
  });

  it("should update todos through runtime callback", async () => {
    const todos = [
      {
        content: "Write Red tests",
        status: "completed" as const,
        activeForm: "Writing Red tests",
      },
      {
        content: "Implement Green code",
        status: "in_progress" as const,
        activeForm: "Implementing Green code",
      },
    ];
    const updateTodos = vi.fn((items) => items);

    const result = await TodoWriteTool.execute(
      { todos },
      createMockToolContext({ updateTodos }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      updatedCount: 2,
      todos,
    });
    expect(updateTodos).toHaveBeenCalledWith(todos);
  });

  it("should be available in plan and agent modes without approval", () => {
    expect(TodoWriteTool.allowedInMode?.("ask")).toBe(true);
    expect(TodoWriteTool.allowedInMode?.("plan")).toBe(true);
    expect(TodoWriteTool.allowedInMode?.("agent")).toBe(true);
    expect(
      TodoWriteTool.requiresApproval?.(
        {
          todos: [
            {
              content: "Plan",
              status: "pending",
              activeForm: "Planning",
            },
          ],
        },
        createMockToolContext(),
      ),
    ).toBe(false);
  });

  it("should be registered and not cached", async () => {
    resetGlobalRegistry();
    registerAllTools();
    expect(globalToolRegistry.has("TodoWrite")).toBe(true);

    const registry = new ToolRegistry();
    registry.register(TodoWriteTool);
    const updateTodos = vi.fn((items) => items);
    const context = createMockToolContext({ updateTodos });

    const first = await registry.execute(
      "TodoWrite",
      {
        todos: [{ content: "A", status: "pending", activeForm: "Doing A" }],
      },
      context,
    );
    const second = await registry.execute(
      "TodoWrite",
      {
        todos: [{ content: "B", status: "pending", activeForm: "Doing B" }],
      },
      context,
    );

    expect(first.metadata?.cached).toBe(false);
    expect(second.metadata?.cached).toBe(false);
    expect(updateTodos).toHaveBeenCalledTimes(2);
  });
});
