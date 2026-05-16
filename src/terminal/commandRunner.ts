/**
 * Command execution with streaming, timeout, and security
 */

import type { Logger } from '../telemetry/logger';
import type { TerminalSessionManager } from './session';
import type { CommandResult, SecurityConfig, CommandDenylistPattern } from './types';

export class CommandRunner {
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
    private readonly logger: Logger
  ) {}

  async run(
    command: string,
    options: {
      sessionId?: string;
      timeout?: number;
      cwd?: string;
      env?: Record<string, string>;
    } = {}
  ): Promise<CommandResult> {
    const startTime = Date.now();

    this.logger.info('Running command', { command, sessionId: options.sessionId });

    const validation = this.validateCommand(command);
    if (!validation.allowed) {
      throw new Error(`Command blocked: ${validation.reason}`);
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
      throw new Error('Failed to get session');
    }

    this.sessionManager.updateLastUsed(sessionId);

    const timeout = Math.min(
      options.timeout ?? this.securityConfig.defaultTimeout,
      this.securityConfig.maxTimeout
    );

    return this.executeWithTimeout(entry.pty, command, timeout, startTime);
  }

  private async executeWithTimeout(
    pty: import('./pty').PTYManager,
    command: string,
    timeout: number,
    startTime: number
  ): Promise<CommandResult> {

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let completed = false;
      let timeoutId: NodeJS.Timeout;

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        pty.onData(() => {});
        pty.onExit(() => {});
      };

      const finish = (timedOut: boolean, exitCode: number | null = null): void => {
        if (completed) {
          return;
        }
        completed = true;

        cleanup();

        const duration = Date.now() - startTime;

        const result: CommandResult = {
          stdout,
          stderr,
          exitCode,
          timedOut,
          duration,
        };

        this.logger.info('Command completed', {
          command,
          duration,
          timedOut,
          exitCode,
          outputLength: stdout.length,
        });

        resolve(result);
      };

      pty.clearOutput();

      pty.onData((data) => {
        stdout += data;
      });

      pty.onExit((exitCode) => {
        this.logger.debug('Command process exited', { command, exitCode });
        finish(false, exitCode);
      });

      timeoutId = setTimeout(() => {
        this.logger.warn('Command timed out', { command, timeout });
        finish(true, null);
      }, timeout);

      pty.write(command);
    });
  }

  validateCommand(command: string): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
    for (const pattern of this.securityConfig.denylist) {
      if (this.matchesPattern(command, pattern)) {
        return { allowed: false, reason: 'Command matches denylist pattern' };
      }
    }

    for (const pattern of this.securityConfig.requiresApproval) {
      if (this.matchesPattern(command, pattern)) {
        return { allowed: true, requiresApproval: true };
      }
    }

    return { allowed: true, requiresApproval: false };
  }

  private matchesPattern(command: string, pattern: CommandDenylistPattern): boolean {
    if (typeof pattern === 'string') {
      return command.includes(pattern);
    }
    return pattern.test(command);
  }

  setSecurityConfig(config: Partial<SecurityConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
  }

  getSecurityConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }
}
