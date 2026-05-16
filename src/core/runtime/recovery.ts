/**
 * Recovery manager - error recovery & rollback
 */

import type { Logger } from '../../telemetry/logger';
import { RuntimeEventEmitter } from './runtimeEvents';
import { CheckpointManager } from './checkpoints';
import type { RuntimeState } from './runtimeState';
import type { RetryConfig, RecoveryAction, RetryStrategy } from './runtimeTypes';

export class RecoveryManager {
  private readonly retryConfig: RetryConfig = {
    maxAttempts: 3,
    strategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 10000,
  };
  private attemptCounts = new Map<string, number>();

  constructor(
    private readonly _logger: Logger, // Reserved for future logging
    private readonly checkpointManager: CheckpointManager,
    private readonly eventEmitter: RuntimeEventEmitter,
  ) {}

  async handleError(error: Error, state: RuntimeState, context: string): Promise<RecoveryAction> {
    const errorKey = `${context}-${error.message}`;
    const attempts = this.attemptCounts.get(errorKey) ?? 0;

    if (!this.isRecoverable(error)) {
      return { action: 'fail', error };
    }

    if (attempts >= this.retryConfig.maxAttempts) {
      const memory = state.getMemory();
      const checkpointId = memory.lastCheckpointId;
      return checkpointId
        ? { action: 'rollback', checkpointId }
        : { action: 'fail', error };
    }

    this.attemptCounts.set(errorKey, attempts + 1);
    const delay = this.calculateDelay(attempts, this.retryConfig.strategy);

    return { action: 'retry', delayMs: delay };
  }

  async executeRecovery(action: RecoveryAction, state: RuntimeState): Promise<void> {
    this.eventEmitter.emitEvent({
      type: 'recovery_started',
      action: action.action,
      attempt: 0,
      timestamp: Date.now(),
    });

    switch (action.action) {
      case 'retry':
        if (action.delayMs) {
          await this.delay(action.delayMs);
        }
        break;

      case 'rollback':
        if (action.checkpointId) {
          await this.checkpointManager.restore(action.checkpointId);
          state.setCheckpoint(action.checkpointId);
          this.eventEmitter.emitEvent({
            type: 'checkpoint_restored',
            checkpointId: action.checkpointId,
            iteration: state.getExecution().currentIteration,
            timestamp: Date.now(),
          });
        }
        break;

      case 'fail':
        if (action.error) {
          throw action.error;
        }
        break;
    }

    this.eventEmitter.emitEvent({
      type: 'recovery_complete',
      action: action.action,
      success: action.action !== 'fail',
      timestamp: Date.now(),
    });
  }

  resetAttempts(context: string): void {
    for (const key of this.attemptCounts.keys()) {
      if (key.startsWith(context)) {
        this.attemptCounts.delete(key);
      }
    }
  }

  private isRecoverable(error: Error): boolean {
    const recoverablePatterns = [
      /timeout/i,
      /ECONNREFUSED/i,
      /rate.*limit/i,
      /429/,
      /503/,
    ];
    return recoverablePatterns.some((pattern) => pattern.test(error.message));
  }

  private calculateDelay(attempts: number, strategy: RetryStrategy): number {
    const { baseDelayMs, maxDelayMs } = this.retryConfig;
    
    switch (strategy) {
      case 'exponential':
        return Math.min(baseDelayMs * Math.pow(2, attempts), maxDelayMs);
      case 'linear':
        return Math.min(baseDelayMs * (attempts + 1), maxDelayMs);
      case 'immediate':
        return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
