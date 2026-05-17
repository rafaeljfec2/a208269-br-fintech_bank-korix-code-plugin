/**
 * Terminal session management - persistent shell sessions
 */

import { getLogger } from "../telemetry/logger";
import { PTYManager } from "./pty";
import type { TerminalOptions, TerminalSession } from "./types";

export class TerminalSessionManager {
  private sessions = new Map<
    string,
    { session: TerminalSession; pty: PTYManager }
  >();
  private sessionCounter = 0;

  createSession(options: TerminalOptions = {}): string {
    const logger = getLogger();
    const sessionId = `session-${++this.sessionCounter}-${Date.now()}`;

    const session: TerminalSession = {
      id: sessionId,
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? {},
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    const pty = new PTYManager();
    pty.spawn(options);

    this.sessions.set(sessionId, { session, pty });

    logger.info("Terminal session created", {
      sessionId,
      cwd: session.cwd,
      totalSessions: this.sessions.size,
    });

    return sessionId;
  }

  getSession(
    sessionId: string,
  ): { session: TerminalSession; pty: PTYManager } | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  updateLastUsed(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.session.lastUsed = Date.now();
    }
  }

  killSession(sessionId: string): void {
    const logger = getLogger();
    const entry = this.sessions.get(sessionId);

    if (entry) {
      logger.info("Killing terminal session", { sessionId });
      entry.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  killAllSessions(): void {
    const logger = getLogger();
    logger.info("Killing all terminal sessions", { count: this.sessions.size });

    for (const [sessionId, entry] of this.sessions.entries()) {
      entry.pty.kill();
      this.sessions.delete(sessionId);
    }
  }

  cleanupIdleSessions(maxIdleTime = 30 * 60 * 1000): void {
    const logger = getLogger();
    const now = Date.now();
    const toKill: string[] = [];

    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now - entry.session.lastUsed > maxIdleTime) {
        toKill.push(sessionId);
      }
    }

    if (toKill.length > 0) {
      logger.info("Cleaning up idle sessions", { count: toKill.length });
      for (const sessionId of toKill) {
        this.killSession(sessionId);
      }
    }
  }

  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((entry) => entry.session);
  }

  dispose(): void {
    this.killAllSessions();
  }
}

export let globalSessionManager: TerminalSessionManager | null = null;

export function initializeSessionManager(): TerminalSessionManager {
  globalSessionManager = new TerminalSessionManager();
  return globalSessionManager;
}

export function getSessionManager(): TerminalSessionManager {
  if (!globalSessionManager) {
    throw new Error("Session manager not initialized");
  }
  return globalSessionManager;
}
