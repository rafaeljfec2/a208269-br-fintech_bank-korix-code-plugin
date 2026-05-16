/**
 * Command execution with streaming, timeout, and security
 */

import { getLogger } from '../telemetry/logger';
import { getSessionManager } from './session';
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

  async run(
    command: string,
    options: {
      sessionId?: string;
      timeout?: number;
      cwd?: string;
      env?: Record<string, string>;
    } = {}
  ): Promise<CommandResult> {
    const logger = getLogger();
    const startTime = Date.now();

    logger.info('Running command', { command, sessionId: options.sessionId });

    const validation = this.validateCommand(command);
    if (!validation.allowed) {
      throw new Error(`Command blocked: ${validation.reason}`);
    }

    const sessionManager = getSessionManager();
    let sessionId = options.sessionId;

    if (!sessionId || !sessionManager.hasSession(sessionId)) {
      sessionId = sessionManager.createSession({
        cwd: options.cwd,
        env: options.env,
      });
    }

    const entry = sessionManager.getSession(sessionId);
    if (!entry) {
      throw new Error('Failed to get session');
    }

    sessionManager.updateLastUsed(sessionId);

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
    const logger = getLogger();

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

        logger.info('Command completed', {
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
        logger.debug('Command process exited', { command, exitCode });
        finish(false, exitCode);
      });

      timeoutId = setTimeout(() => {
        logger.warn('Command timed out', { command, timeout });
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

export let globalCommandRunner: CommandRunner | null = null;

export function initializeCommandRunner(): CommandRunner {
  globalCommandRunner = new CommandRunner();
  return globalCommandRunner;
}

export function getCommandRunner(): CommandRunner {
  if (!globalCommandRunner) {
    throw new Error('Command runner not initialized');
  }
  return globalCommandRunner;
}
