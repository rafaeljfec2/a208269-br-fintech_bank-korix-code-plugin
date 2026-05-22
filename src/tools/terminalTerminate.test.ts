import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";
import { globalToolRegistry } from "../harness/toolRegistry";

const commandRunnerMock = vi.hoisted(() => ({
  terminateSession: vi.fn(),
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

import { registerAllTools } from "./index";
import { TerminateSessionTool } from "./terminalTerminate";

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("TerminateSessionTool", () => {
  beforeEach(() => {
    commandRunnerMock.terminateSession.mockReset();
    resetGlobalRegistry();
  });

  it("should terminate an existing terminal session", async () => {
    commandRunnerMock.terminateSession.mockReturnValue(true);

    const result = await TerminateSessionTool.execute(
      { sessionId: "session-1" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      sessionId: "session-1",
      terminated: true,
    });
    expect(commandRunnerMock.terminateSession).toHaveBeenCalledWith("session-1");
  });

  it("should return failure for an unknown session", async () => {
    commandRunnerMock.terminateSession.mockReturnValue(false);

    const result = await TerminateSessionTool.execute(
      { sessionId: "missing" },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Session not found");
  });

  it("should require approval", () => {
    expect(
      TerminateSessionTool.requiresApproval?.(
        { sessionId: "session-1" },
        createMockToolContext(),
      ),
    ).toBe(true);
  });

  it("should only be available in agent mode", () => {
    expect(TerminateSessionTool.allowedInMode?.("ask")).toBe(false);
    expect(TerminateSessionTool.allowedInMode?.("plan")).toBe(false);
    expect(TerminateSessionTool.allowedInMode?.("agent")).toBe(true);
  });

  it("should be registered by registerAllTools", () => {
    registerAllTools();

    expect(globalToolRegistry.has("TerminateSession")).toBe(true);
  });
});
