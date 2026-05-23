/**
 * Command execution with streaming, timeout, and security
 */

import type { Logger } from "../telemetry/logger";
import type { TerminalSessionManager } from "./session";
import type {
  BackgroundSessionStatus,
  CommandResult,
  SecurityConfig,
  CommandDenylistPattern,
} from "./types";

interface BackgroundSession {
  readonly id: string;
  output: string;
  exitCode: number | null;
  exited: boolean;
  readonly createdAt: number;
  timeoutId?: NodeJS.Timeout;
}

const MAX_BACKGROUND_OUTPUT_CHARS = 200_000;
const ESCAPE_CHARACTER = "\u001B";
const ANSI_CONTROL_SEQUENCE_PATTERN = new RegExp(
  String.raw`${ESCAPE_CHARACTER}(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|${ESCAPE_CHARACTER}\\))`,
  "g",
);

export class CommandRunner {
  private readonly backgroundSessions = new Map<string, BackgroundSession>();
  private securityConfig: SecurityConfig = {
    denylist: [
      /rm\s+-rf\s+\//,
      /dd\s+if=/,
      /mkfs/,
      /format\s+[a-z]:/i,
      /curl.*\|\s*bash/,
      /wget.*\|\s*sh/,
      /:\(\)\{\s*:\|:&\s*\};:/,
    ],
    requiresApproval: [
      /rm\s+-rf/,
      /sudo/,
      /su\s+/,
      /shutdown/,
      /reboot/,
      /git\s+push\s+--force/,
      /npm\s+publish/,
      /docker\s+system\s+prune/,
    ],
    maxTimeout: 5 * 60 * 1000,
    defaultTimeout: 30 * 1000,
  };

  constructor(
    private readonly sessionManager: TerminalSessionManager,
    private readonly logger: Logger,
  ) {}

  async run(
    command: string,
    options: {
      sessionId?: string;
      timeout?: number;
      cwd?: string;
      env?: Record<string, string>;
      background?: boolean;
    } = {},
  ): Promise<CommandResult> {
    const startTime = Date.now();

    this.logger.info("Running command", {
      command,
      sessionId: options.sessionId,
    });

    const validation = this.validateCommand(command);
    if (!validation.allowed) {
      throw new Error(`Command blocked: ${validation.reason}`);
    }

    if (options.background) {
      return this.runInBackground(command, options, startTime);
    }

    let sessionId = options.sessionId;

    if (!sessionId || !this.sessionManager.hasSession(sessionId)) {
      sessionId = this.sessionManager.createSession({
        cwd: options.cwd,
        env: options.env,
      });
    }

    const entry = this.sessionManager.getSession(sessionId);
    if (!entry) {
      throw new Error("Failed to get session");
    }

    this.sessionManager.updateLastUsed(sessionId);

    const timeout = Math.min(
      options.timeout ?? this.securityConfig.defaultTimeout,
      this.securityConfig.maxTimeout,
    );

    return this.executeWithTimeout(entry.pty, command, timeout, startTime);
  }

  getSessionStatus(sessionId: string): Promise<BackgroundSessionStatus | null> {
    const session = this.backgroundSessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      sessionId: session.id,
      output: this.sanitizeTerminalOutput(session.output),
      exited: session.exited,
      exitCode: session.exitCode,
    });
  }

  terminateSession(sessionId: string): boolean {
    if (!this.sessionManager.hasSession(sessionId)) {
      return false;
    }

    const session = this.backgroundSessions.get(sessionId);
    if (session?.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    this.backgroundSessions.delete(sessionId);
    this.sessionManager.killSession(sessionId);
    return true;
  }

  private runInBackground(
    command: string,
    options: {
      readonly sessionId?: string;
      readonly timeout?: number;
      readonly cwd?: string;
      readonly env?: Record<string, string>;
    },
    startTime: number,
  ): CommandResult {
    let sessionId = options.sessionId;

    if (!sessionId || !this.sessionManager.hasSession(sessionId)) {
      sessionId = this.sessionManager.createSession({
        cwd: options.cwd,
        env: options.env,
      });
    }

    const entry = this.sessionManager.getSession(sessionId);
    if (!entry) {
      throw new Error("Failed to get session");
    }

    this.sessionManager.updateLastUsed(sessionId);

    const timeout = Math.min(
      options.timeout ?? this.securityConfig.maxTimeout,
      this.securityConfig.maxTimeout,
    );
    const session: BackgroundSession = {
      id: sessionId,
      output: "",
      exitCode: null,
      exited: false,
      createdAt: Date.now(),
    };

    const markerPattern = this.createExitMarkerPattern(sessionId);
    const commandWithMarker = this.withExitMarker(command, sessionId);

    entry.pty.clearOutput();
    entry.pty.onData((data) => {
      session.output += data;
      const match = markerPattern.exec(session.output);

      if (match) {
        session.exitCode = Number(match[1]);
        session.exited = true;
        if (session.timeoutId) {
          clearTimeout(session.timeoutId);
        }
        session.output = session.output.replace(markerPattern, "");
        session.output = this.stripCommandEcho(
          session.output,
          command,
          commandWithMarker,
        );
      }

      session.output = this.capBackgroundOutput(session.output);
    });

    entry.pty.onExit((exitCode) => {
      session.exitCode = exitCode;
      session.exited = true;
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
    });

    session.timeoutId = setTimeout(() => {
      if (!session.exited) {
        this.logger.warn("Background command timed out", {
          command,
          sessionId,
          timeout,
        });
        this.sessionManager.killSession(sessionId);
        session.exited = true;
      }
    }, timeout);
    session.timeoutId.unref?.();

    this.backgroundSessions.set(sessionId, session);
    entry.pty.write(commandWithMarker);

    return {
      stdout: session.output,
      stderr: "",
      exitCode: null,
      timedOut: false,
      duration: Date.now() - startTime,
      sessionId,
      background: true,
    };
  }

  private async executeWithTimeout(
    pty: import("./pty").PTYManager,
    command: string,
    timeout: number,
    startTime: number,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      let stdout = "";
      const stderr = "";
      let completed = false;

      const cleanup = (timeoutId: NodeJS.Timeout): void => {
        clearTimeout(timeoutId);
        pty.onData(() => {});
        pty.onExit(() => {});
      };

      const finish = (
        timedOut: boolean,
        exitCode: number | null = null,
        timeoutId?: NodeJS.Timeout,
      ): void => {
        if (completed) {
          return;
        }
        completed = true;

        if (timeoutId) {
          cleanup(timeoutId);
        }

        const duration = Date.now() - startTime;
        const cleanStdout = this.stripCommandEcho(
          stdout,
          command,
          commandWithMarker,
        );

        const result: CommandResult = {
          stdout: cleanStdout,
          stderr,
          exitCode,
          timedOut,
          duration,
        };

        this.logger.info("Command completed", {
          command,
          duration,
          timedOut,
          exitCode,
          outputLength: stdout.length,
        });

        resolve(result);
      };

      pty.clearOutput();
      const markerPattern = this.createExitMarkerPattern("foreground");
      const commandWithMarker = this.withExitMarker(command, "foreground");

      pty.onData((data) => {
        stdout += data;
        const match = markerPattern.exec(stdout);

        if (match) {
          stdout = stdout.replace(markerPattern, "");
          finish(false, Number(match[1]), timeoutId);
        }
      });

      const timeoutId = setTimeout(() => {
        this.logger.warn("Command timed out", { command, timeout });
        finish(true, null, timeoutId);
      }, timeout);

      pty.onExit((exitCode) => {
        this.logger.debug("Command process exited", { command, exitCode });
        finish(false, exitCode, timeoutId);
      });

      pty.write(commandWithMarker);
    });
  }

  validateCommand(command: string): {
    allowed: boolean;
    reason?: string;
    requiresApproval?: boolean;
  } {
    for (const pattern of this.securityConfig.denylist) {
      if (this.matchesPattern(command, pattern)) {
        return { allowed: false, reason: "Command matches denylist pattern" };
      }
    }

    for (const pattern of this.securityConfig.requiresApproval) {
      if (this.matchesPattern(command, pattern)) {
        return { allowed: true, requiresApproval: true };
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  private matchesPattern(
    command: string,
    pattern: CommandDenylistPattern,
  ): boolean {
    if (typeof pattern === "string") {
      return command.includes(pattern);
    }
    return pattern.test(command);
  }

  private withExitMarker(command: string, sessionId: string): string {
    return `${command}\nprintf '\\n__KORIX_BACKGROUND_EXIT_${this.toMarkerId(sessionId)}:%s__\\n' "$?"`;
  }

  private stripCommandEcho(
    output: string,
    command: string,
    wrappedCommand?: string,
  ): string {
    const normalizedOutput = this.sanitizeTerminalOutput(output);
    const normalizedCommand = this.normalizeLineEndings(command).trimEnd();
    const normalizedWrappedCommand =
      wrappedCommand === undefined
        ? undefined
        : this.normalizeLineEndings(wrappedCommand).trimEnd();

    if (
      normalizedWrappedCommand &&
      normalizedOutput.startsWith(`${normalizedWrappedCommand}\n`)
    ) {
      return normalizedOutput.slice(normalizedWrappedCommand.length + 1);
    }

    if (normalizedOutput.startsWith(`${normalizedCommand}\n`)) {
      return normalizedOutput.slice(normalizedCommand.length + 1);
    }

    return normalizedOutput;
  }

  private sanitizeTerminalOutput(output: string): string {
    return output
      .replaceAll(ANSI_CONTROL_SEQUENCE_PATTERN, "")
      .split("")
      .filter((char) => {
        const code = char.codePointAt(0) ?? 0;
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code > 31 && code !== 127)
        );
      })
      .join("")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
  }

  private normalizeLineEndings(value: string): string {
    return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  }

  private createExitMarkerPattern(sessionId: string): RegExp {
    return new RegExp(
      String.raw`__KORIX_BACKGROUND_EXIT_${this.escapeRegex(this.toMarkerId(sessionId))}:(-?\d+)__\r?\n?`,
    );
  }

  private toMarkerId(sessionId: string): string {
    return sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
  }

  private escapeRegex(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  }

  private capBackgroundOutput(output: string): string {
    if (output.length <= MAX_BACKGROUND_OUTPUT_CHARS) {
      return output;
    }

    return output.slice(output.length - MAX_BACKGROUND_OUTPUT_CHARS);
  }

  setSecurityConfig(config: Partial<SecurityConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
  }

  getSecurityConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }
}
