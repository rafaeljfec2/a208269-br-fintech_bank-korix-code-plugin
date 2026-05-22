import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";
import { ToolRegistry, globalToolRegistry } from "../harness/toolRegistry";

const commandRunnerMock = vi.hoisted(() => ({
  getSessionStatus: vi.fn(),
}));

vi.mock("../di/container", () => ({
  getGlobalContainer: () => ({
    get: () => commandRunnerMock,
  }),
}));

vi.mock("../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { AwaitTool } from "./terminalAwait";
import { registerAllTools } from "./index";

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("AwaitTool", () => {
  beforeEach(() => {
    commandRunnerMock.getSessionStatus.mockReset();
    resetGlobalRegistry();
  });

  it("should return success when the pattern matches session output", async () => {
    commandRunnerMock.getSessionStatus.mockResolvedValue({
      sessionId: "session-1",
      output: "server ready\n",
      exited: false,
      exitCode: null,
    });

    const result = await AwaitTool.execute(
      {
        sessionId: "session-1",
        pattern: "ready",
        timeout: 50,
        pollInterval: 1,
      },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      matched: true,
      output: "server ready\n",
      exited: false,
      exitCode: null,
    });
  });

  it("should return success when the background command exits before timeout", async () => {
    commandRunnerMock.getSessionStatus.mockResolvedValue({
      sessionId: "session-1",
      output: "done\n",
      exited: true,
      exitCode: 0,
    });

    const result = await AwaitTool.execute(
      { sessionId: "session-1", timeout: 50, pollInterval: 1 },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toMatchObject({
      matched: false,
      output: "done\n",
      exited: true,
      exitCode: 0,
    });
  });

  it("should return failure for an unknown session", async () => {
    commandRunnerMock.getSessionStatus.mockResolvedValue(null);

    const result = await AwaitTool.execute(
      { sessionId: "missing", timeout: 50, pollInterval: 1 },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Session not found");
  });

  it("should return failure for an invalid regex pattern", async () => {
    const result = await AwaitTool.execute(
      { sessionId: "session-1", pattern: "[" },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid regex pattern");
    expect(commandRunnerMock.getSessionStatus).not.toHaveBeenCalled();
  });

  it("should timeout with latest output when pattern is not matched", async () => {
    commandRunnerMock.getSessionStatus.mockResolvedValue({
      sessionId: "session-1",
      output: "still running\n",
      exited: false,
      exitCode: null,
    });

    const result = await AwaitTool.execute(
      {
        sessionId: "session-1",
        pattern: "complete",
        timeout: 5,
        pollInterval: 1,
      },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout");
    expect(result.data).toMatchObject({
      matched: false,
      output: "still running\n",
      exited: false,
      exitCode: null,
    });
  });

  it("should only be available in agent mode", () => {
    expect(AwaitTool.allowedInMode?.("ask")).toBe(false);
    expect(AwaitTool.allowedInMode?.("plan")).toBe(false);
    expect(AwaitTool.allowedInMode?.("agent")).toBe(true);
  });

  it("should be registered by registerAllTools", () => {
    registerAllTools();

    expect(globalToolRegistry.has("Await")).toBe(true);
  });

  it("should not cache registry executions", async () => {
    commandRunnerMock.getSessionStatus.mockResolvedValue({
      sessionId: "session-1",
      output: "ready\n",
      exited: false,
      exitCode: null,
    });

    const registry = new ToolRegistry();
    registry.register(AwaitTool);
    const context = createMockToolContext();

    const first = await registry.execute(
      "Await",
      { sessionId: "session-1", pattern: "ready" },
      context,
    );
    const second = await registry.execute(
      "Await",
      { sessionId: "session-1", pattern: "ready" },
      context,
    );

    expect(first.success, first.error).toBe(true);
    expect(second.success, second.error).toBe(true);
    expect(first.metadata?.cached).toBe(false);
    expect(second.metadata?.cached).toBe(false);
    expect(commandRunnerMock.getSessionStatus).toHaveBeenCalledTimes(2);
  });
});
