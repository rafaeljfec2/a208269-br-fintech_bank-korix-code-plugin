import { describe, expect, it, vi } from "vitest";
import { CommandRunner } from "./commandRunner";
import type { TerminalSessionManager } from "./session";
import type { TerminalSession } from "./types";
import type { Logger } from "../telemetry/logger";

type DataCallback = (data: string) => void;
type ExitCallback = (exitCode: number) => void;

class FakePty {
  private dataCallback: DataCallback = () => undefined;
  private exitCallback: ExitCallback = () => undefined;
  readonly write = vi.fn();

  onData(callback: DataCallback): void {
    this.dataCallback = callback;
  }

  onExit(callback: ExitCallback): void {
    this.exitCallback = callback;
  }

  clearOutput(): void {
    // no-op for tests
  }

  emitData(data: string): void {
    this.dataCallback(data);
  }

  emitExit(exitCode: number): void {
    this.exitCallback(exitCode);
  }
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}

function createSessionManager(fakePty: FakePty): TerminalSessionManager {
  const session: TerminalSession = {
    id: "session-test",
    cwd: "/repo",
    env: {},
    createdAt: 1,
    lastUsed: 1,
  };

  return {
    createSession: vi.fn(() => session.id),
    getSession: vi.fn(() => ({ session, pty: fakePty })),
    hasSession: vi.fn(() => true),
    updateLastUsed: vi.fn(),
    killSession: vi.fn(),
  } as unknown as TerminalSessionManager;
}

describe("CommandRunner background sessions", () => {
  it("should start a background command and return a session id without waiting for exit", async () => {
    const fakePty = new FakePty();
    const runner = new CommandRunner(
      createSessionManager(fakePty),
      createLogger(),
    );

    const result = await runner.run("npm test", { background: true });

    expect(result).toMatchObject({
      stdout: "",
      sessionId: "session-test",
      background: true,
      timedOut: false,
    });
    expect(fakePty.write).toHaveBeenCalledOnce();
  });

  it("should expose incremental background output by session id", async () => {
    const fakePty = new FakePty();
    const runner = new CommandRunner(
      createSessionManager(fakePty),
      createLogger(),
    );

    const result = await runner.run("npm test", { background: true });
    fakePty.emitData("first line\n");
    fakePty.emitData("second line\n");

    const status = await runner.getSessionStatus(result.sessionId ?? "");

    expect(status).toEqual({
      sessionId: "session-test",
      output: "first line\nsecond line\n",
      exited: false,
      exitCode: null,
    });
  });

  it("should mark a background session exited when the internal marker is emitted", async () => {
    const fakePty = new FakePty();
    const runner = new CommandRunner(
      createSessionManager(fakePty),
      createLogger(),
    );

    const result = await runner.run("npm test", { background: true });
    fakePty.emitData("tests passed\n");
    fakePty.emitData(`__KORIX_BACKGROUND_EXIT_${result.sessionId}:0__\n`);

    const status = await runner.getSessionStatus(result.sessionId ?? "");

    expect(status).toEqual({
      sessionId: "session-test",
      output: "tests passed\n",
      exited: true,
      exitCode: 0,
    });
  });

  it("should return null for an unknown background session", async () => {
    const fakePty = new FakePty();
    const runner = new CommandRunner(
      createSessionManager(fakePty),
      createLogger(),
    );

    await expect(runner.getSessionStatus("missing")).resolves.toBeNull();
  });

  it("should reject denylisted commands before creating a background session", async () => {
    const fakePty = new FakePty();
    const sessionManager = createSessionManager(fakePty);
    const runner = new CommandRunner(sessionManager, createLogger());

    await expect(runner.run("rm -rf /", { background: true })).rejects.toThrow(
      "Command blocked",
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();
  });
});
