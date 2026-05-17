/**
 * PTY wrapper for terminal spawning and I/O
 */

import * as pty from "node-pty";
import * as os from "os";
import { getLogger } from "../telemetry/logger";
import type { TerminalOptions } from "./types";

export class PTYManager {
  private pty: pty.IPty | null = null;
  private outputBuffer: string[] = [];
  private onDataCallback?: (data: string) => void;
  private onExitCallback?: (exitCode: number) => void;

  spawn(options: TerminalOptions = {}): void {
    const logger = getLogger();

    const shell =
      options.shell ?? (os.platform() === "win32" ? "powershell.exe" : "bash");
    const cwd = options.cwd ?? process.cwd();
    const env = { ...process.env, ...options.env };

    logger.debug("Spawning PTY", { shell, cwd });

    this.pty = pty.spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd,
      env: env,
    });

    this.pty.onData((data) => {
      this.outputBuffer.push(data);
      if (this.onDataCallback) {
        this.onDataCallback(data);
      }
    });

    this.pty.onExit((e) => {
      const exitCode = e.exitCode;
      logger.debug("PTY process exited", { pid: this.pty?.pid, exitCode });
      if (this.onExitCallback) {
        this.onExitCallback(exitCode);
      }
    });

    logger.info("PTY spawned", { pid: this.pty.pid, shell });
  }

  write(command: string): void {
    if (!this.pty) {
      throw new Error("PTY not spawned");
    }

    const logger = getLogger();
    logger.debug("Writing to PTY", { command });

    this.pty.write(command);
    if (!command.endsWith("\n")) {
      this.pty.write("\n");
    }
  }

  onData(callback: (data: string) => void): void {
    this.onDataCallback = callback;
  }

  onExit(callback: (exitCode: number) => void): void {
    this.onExitCallback = callback;
  }

  getOutput(): string {
    return this.outputBuffer.join("");
  }

  clearOutput(): void {
    this.outputBuffer = [];
  }

  resize(cols: number, rows: number): void {
    if (this.pty) {
      this.pty.resize(cols, rows);
    }
  }

  kill(): void {
    const logger = getLogger();

    if (this.pty) {
      logger.debug("Killing PTY", { pid: this.pty.pid });
      this.pty.kill();
      this.pty = null;
    }
  }

  isAlive(): boolean {
    return this.pty !== null;
  }

  getPid(): number | undefined {
    return this.pty?.pid;
  }
}
