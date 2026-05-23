import { describe, expect, it } from "vitest";
import { ToolScheduler, type ScheduledTask } from "./ToolScheduler";
import type { ToolResult } from "../../harness/toolRegistry";

function deferred(): {
  readonly promise: Promise<ToolResult<{ readonly done: true }>>;
  readonly resolve: () => void;
} {
  let resolvePromise: (value: ToolResult<{ readonly done: true }>) => void =
    () => undefined;
  const promise = new Promise<ToolResult<{ readonly done: true }>>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise({ success: true, data: { done: true } }),
  };
}

describe("ToolScheduler batch isolation", () => {
  it("should not let completed task ids from a previous batch satisfy new dependencies", async () => {
    const scheduler = new ToolScheduler();

    await scheduler.scheduleMany(
      [{ id: "task-0", tool: "Previous", input: {}, priority: 1 }],
      async () => ({ success: true, data: { done: true } }),
    );

    const gate = deferred();
    const executed: string[] = [];
    const tasks: readonly ScheduledTask[] = [
      { id: "task-0", tool: "CurrentWriter", input: {}, priority: 1 },
      {
        id: "task-1",
        tool: "CurrentReader",
        input: {},
        priority: 1,
        dependencies: ["task-0"],
      },
    ];

    const run = scheduler.scheduleMany(tasks, async (tool) => {
      executed.push(tool);
      if (tool === "CurrentWriter") {
        return gate.promise;
      }

      return { success: true, data: { done: true } };
    });

    await Promise.resolve();
    expect(executed).toEqual(["CurrentWriter"]);

    gate.resolve();
    await run;

    expect(executed).toEqual(["CurrentWriter", "CurrentReader"]);
  });
});

