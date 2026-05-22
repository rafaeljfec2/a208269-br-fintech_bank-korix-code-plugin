import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { ExecutionEngine } from "./executionEngine";
import { RuntimeState } from "./runtimeState";
import { RuntimeMetrics } from "./runtimeMetrics";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { CheckpointManager } from "./checkpoints";
import type { PermissionManager } from "../../harness/permissions";
import { ToolRegistry } from "../../harness/toolRegistry";
import type { AIProvider } from "../providers/types";
import type { Logger } from "../../telemetry/logger";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createState(): RuntimeState {
  return new RuntimeState({
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  });
}

describe("Runtime todo state", () => {
  it("should persist todos in runtime snapshots", () => {
    const state = createState();
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

    state.updateTodos(todos);
    const snapshot = state.createSnapshot();
    const restored = createState();
    restored.restoreSnapshot(snapshot);

    expect(restored.getTodos()).toEqual(todos);
    expect(restored.getConversation().todos).toEqual(todos);
  });

  it("should reject multiple in-progress todos", () => {
    const state = createState();

    expect(() =>
      state.updateTodos([
        {
          content: "A",
          status: "in_progress",
          activeForm: "Doing A",
        },
        {
          content: "B",
          status: "in_progress",
          activeForm: "Doing B",
        },
      ]),
    ).toThrow("Only one");
  });
});

describe("ExecutionEngine todo context", () => {
  it("should execute TodoWrite with runtime context and emit todos_updated", async () => {
    const eventEmitter = new RuntimeEventEmitter(logger);
    const events: string[] = [];
    eventEmitter.onEvent((event) => {
      events.push(event.type);
    });

    const state = createState();
    const registry = new ToolRegistry();
    registry.register({
      name: "TodoWrite",
      description: "test todo tool",
      schema: z.object({ todos: z.array(z.unknown()) }),
      async execute(_input, context) {
        const todos = [
          {
            content: "Run tests",
            status: "in_progress" as const,
            activeForm: "Running tests",
          },
        ];
        const updated = context.updateTodos?.(todos);
        return {
          success: true,
          data: { updatedCount: updated?.length ?? 0, todos: updated },
          metadata: {
            duration: 1,
            approved: true,
            timestamp: Date.now(),
          },
        };
      },
    });

    const provider: AIProvider = {
      type: "test",
      config: {
        type: "test",
        apiKey: "",
        model: "test-model",
        maxTokens: 1024,
      },
      async *send() {
        yield {
          type: "tool_call_complete",
          index: 0,
          id: "call-1",
          name: "TodoWrite",
          arguments: JSON.stringify({ todos: [] }),
          timestamp: Date.now(),
          correlation: {
            correlationId: "corr-1",
            sessionId: "session-1",
          },
        };
        yield {
          type: "finish",
          reason: "tool_calls",
          timestamp: Date.now(),
          correlation: {
            correlationId: "corr-1",
            sessionId: "session-1",
          },
        };
        return {
          model: "test-model",
          totalDuration: 1,
        };
      },
      async dispose() {},
    };
    const permissionManager: PermissionManager = {
      checkPermission: vi.fn(async () => ({ approved: true })),
    };

    const engine = new ExecutionEngine(
      provider,
      registry,
      permissionManager,
      eventEmitter,
      new CheckpointManager(logger),
      new RuntimeMetrics(logger),
      new IterationGuard(logger, eventEmitter),
      new CancellationManager(logger, eventEmitter),
      logger,
      "system",
    );

    await engine.step(state);

    expect(state.getTodos()).toEqual([
      {
        content: "Run tests",
        status: "in_progress",
        activeForm: "Running tests",
      },
    ]);
    expect(events).toContain("todos_updated");
  });
});
