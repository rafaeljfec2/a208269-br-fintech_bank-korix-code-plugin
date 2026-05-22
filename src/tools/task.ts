import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import type { SubagentResult } from "../core/subagent/subagentTypes";

const TaskSchema = z.object({
  type: z.enum(["explore"]).describe("Subagent type to run"),
  prompt: z.string().min(1).describe("Focused task prompt for the subagent"),
  context: z.record(z.unknown()).optional(),
});

type TaskInput = z.infer<typeof TaskSchema>;

interface TaskOutput {
  readonly type: "explore";
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly duration: number;
  readonly error?: string;
  readonly metadata: {
    readonly toolsCalled: readonly string[];
  };
}

export const TaskTool: Tool<TaskInput, TaskOutput> = {
  name: "Task",
  description: `Launch a read-only exploration subagent.

MVP scope:
- Only type "explore" is supported.
- The subagent can search/read code with an isolated read-only tool set.
- It cannot edit files, delete files, run shell commands, or ask the user questions.`,
  schema: TaskSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent";
  },

  requiresApproval(): boolean {
    return false;
  },

  async execute(
    input: TaskInput,
    context: ToolContext,
  ): Promise<ToolResult<TaskOutput>> {
    if (!context.runSubagent) {
      return {
        success: false,
        error: "Subagent execution is unavailable in this context",
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }

    const result: SubagentResult = await context.runSubagent({
      type: input.type,
      prompt: input.prompt,
      context: input.context,
      executionContext: context.execution,
    });

    return {
      success: result.success,
      data: {
        type: input.type,
        success: result.success,
        output: result.output,
        iterations: result.iterations,
        duration: result.duration,
        error: result.error,
        metadata: result.metadata,
      },
      error: result.error,
      metadata: {
        duration: result.duration,
        approved: true,
        timestamp: Date.now(),
      },
    };
  },
};
