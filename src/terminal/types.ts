/**
 * Terminal system types
 */

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
  timeout?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  duration: number;
}

export interface TerminalSession {
  id: string;
  cwd: string;
  env: Record<string, string>;
  createdAt: number;
  lastUsed: number;
}

export interface CommandExecution {
  command: string;
  sessionId: string;
  startTime: number;
  timeout: number;
}

export type CommandDenylistPattern = string | RegExp;

export interface SecurityConfig {
  denylist: CommandDenylistPattern[];
  requiresApproval: CommandDenylistPattern[];
  maxTimeout: number;
  defaultTimeout: number;
}
