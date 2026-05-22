import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";

const commandRunnerMock = vi.hoisted(() => ({
  run: vi.fn(),
  validateCommand: vi.fn(),
}));

vi.mock("../di/container", () => ({
  getGlobalContainer: () => ({
    get: () => commandRunnerMock,
  }),
}));

import { RunCommandTool } from "./terminal";

describe("RunCommandTool", () => {
  beforeEach(() => {
    commandRunnerMock.run.mockReset();
    commandRunnerMock.validateCommand.mockReset();
    commandRunnerMock.validateCommand.mockReturnValue({
      allowed: true,
      requiresApproval: false,
    });
  });

  it("should accept background mode in the schema", () => {
    const result = RunCommandTool.schema.safeParse({
      command: "npm test",
      background: true,
    });

    expect(result.success, result.error).toBe(true);
  });

  it("should return structured background command output", async () => {
    commandRunnerMock.run.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      duration: 5,
      sessionId: "session-1",
      background: true,
    });

    const result = await RunCommandTool.execute(
      { command: "npm test", background: true },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      sessionId: "session-1",
      background: true,
    });
    expect(commandRunnerMock.run).toHaveBeenCalledWith("npm test", {
      sessionId: undefined,
      timeout: undefined,
      cwd: undefined,
      background: true,
    });
  });

  it("should preserve foreground command output as structured stdout", async () => {
    commandRunnerMock.run.mockResolvedValue({
      stdout: "done\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      duration: 12,
    });

    const result = await RunCommandTool.execute(
      { command: "echo done" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      stdout: "done\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("should keep approval delegated to command validation", () => {
    commandRunnerMock.validateCommand.mockReturnValue({
      allowed: true,
      requiresApproval: true,
    });

    expect(
      RunCommandTool.requiresApproval?.(
        { command: "sudo npm install" },
        createMockToolContext(),
      ),
    ).toBe(true);
  });

  it("should only be available in agent mode", () => {
    expect(RunCommandTool.allowedInMode?.("ask")).toBe(false);
    expect(RunCommandTool.allowedInMode?.("plan")).toBe(false);
    expect(RunCommandTool.allowedInMode?.("agent")).toBe(true);
  });
});
