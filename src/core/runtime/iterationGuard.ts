/**
 * Iteration guard - loop prevention & stall detection
 */

import type { Logger } from '../../telemetry/logger';
import { RuntimeEventEmitter } from './runtimeEvents';
import type { RuntimeState } from './runtimeState';
import type { GuardResult, ProgressMarker } from './runtimeTypes';

export class IterationGuard {
  private toolCallCounts = new Map<string, number>();
  private lastProgressMarkers: ProgressMarker[] = [];
  private readonly maxSameToolCalls = 3;
  private readonly stallThresholdMs = 30000;

  constructor(
    private readonly _logger: Logger, // Reserved for future logging
    private readonly eventEmitter: RuntimeEventEmitter,
  ) {}

  checkIteration(state: RuntimeState): GuardResult {
    const execution = state.getExecution();

    // Check max iterations
    if (execution.currentIteration >= execution.maxIterations) {
      return { shouldStop: true, reason: 'max_iterations' };
    }

    // Check stalled execution
    const timeSinceActivity = Date.now() - execution.lastActivityTime;
    if (timeSinceActivity > this.stallThresholdMs) {
      this.eventEmitter.emitEvent({
        type: 'stall_detected',
        iteration: execution.currentIteration,
        timeSinceActivity,
        timestamp: Date.now(),
      });
      return { shouldStop: true, reason: 'stalled' };
    }

    // Check duplicate tool calls
    for (const [toolName, count] of this.toolCallCounts) {
      if (count > this.maxSameToolCalls) {
        this.eventEmitter.emitEvent({
          type: 'duplicate_tool_detected',
          toolName,
          count,
          timestamp: Date.now(),
        });
        return { shouldStop: true, reason: 'duplicate_tools' };
      }
    }

    // Check no-progress cycles
    if (this.lastProgressMarkers.length >= 3) {
      const last3 = this.lastProgressMarkers.slice(-3);
      const allSame = last3.every((m) => m.modifiedFiles === last3[0]!.modifiedFiles);
      if (allSame) {
        this.eventEmitter.emitEvent({
          type: 'loop_warning',
          reason: 'no_progress',
          iteration: execution.currentIteration,
          timestamp: Date.now(),
        });
        return { shouldStop: true, reason: 'no_progress' };
      }
    }

    return { shouldStop: false };
  }

  recordToolCall(toolName: string): void {
    const current = this.toolCallCounts.get(toolName) ?? 0;
    this.toolCallCounts.set(toolName, current + 1);
  }

  recordProgress(marker: ProgressMarker): void {
    this.lastProgressMarkers.push(marker);
    if (this.lastProgressMarkers.length > 5) {
      this.lastProgressMarkers.shift();
    }
  }

  reset(): void {
    this.toolCallCounts.clear();
    this.lastProgressMarkers = [];
  }
}
