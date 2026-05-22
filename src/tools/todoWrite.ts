import { z } from "zod";
import type { TodoItem } from "../core/runtime/runtimeTypes";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";

const TodoSchema = z.object({
  content: z.string().trim().min(1),
  status: z.enum(["pending", "in_progress", "completed"]),
  activeForm: z.string().trim().min(1),
});

const TodoWriteSchema = z.object({
  todos: z.array(TodoSchema).min(1).describe("List of todos to update"),
});

type TodoWriteInput = z.infer<typeof TodoWriteSchema>;

interface TodoWriteOutput {
  readonly updatedCount: number;
  readonly todos: readonly TodoItem[];
}

export const TodoWriteTool: Tool<TodoWriteInput, TodoWriteOutput> = {
  name: "TodoWrite",
  description: `Update the task list for the current session.

Use this for multi-step work, SDD phases, TDD Red/Green progress, and handoffs.

Rules:
- Each todo must have content, status, and activeForm.
- Only one todo can be in_progress at a time.
- Mark work completed immediately after finishing it.
- Keep pending todos for work not started yet.`,
  schema: TodoWriteSchema,

  allowedInMode(): boolean {
    return true;
  },

  requiresApproval(): boolean {
    return false;
  },

  execute(
    input: TodoWriteInput,
    context: ToolContext,
  ): Promise<ToolResult<TodoWriteOutput>> {
    const startTime = Date.now();

    if (!context.updateTodos) {
      return Promise.resolve({
        success: false,
        error: "Runtime todo state is unavailable in this context",
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      });
    }

    const inProgressCount = input.todos.filter(
      (todo) => todo.status === "in_progress",
    ).length;
    if (inProgressCount > 1) {
      return Promise.resolve({
        success: false,
        error: "Only one todo can be in_progress at a time",
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      });
    }

    try {
      const todos = context.updateTodos(input.todos);

      return Promise.resolve({
        success: true,
        data: {
          updatedCount: todos.length,
          todos,
        },
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Promise.resolve({
        success: false,
        error: `Failed to update todos: ${message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      });
    }
  },
};
