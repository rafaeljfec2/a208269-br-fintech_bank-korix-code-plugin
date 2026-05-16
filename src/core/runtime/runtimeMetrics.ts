/**
 * Runtime metrics collection
 */

import type { Logger } from '../../telemetry/logger';
import type { RuntimeMetricsSnapshot, RuntimeEventRecord } from './runtimeTypes';

export class RuntimeMetrics {
  private totalTokens = 0;
  private totalToolCalls = 0;
  private iterations = 0;
  private checkpoints = 0;
  private recoveries = 0;
  private toolBreakdown = new Map<string, number>();
  private eventTimeline: RuntimeEventRecord[] = [];
  private readonly startTime: number;

  constructor(private readonly _logger: Logger) { // Reserved for future logging
    this.startTime = Date.now();
  }

  recordToken(count = 1): void {
    this.totalTokens += count;
  }

  recordToolCall(toolName: string): void {
    this.totalToolCalls++;
    const current = this.toolBreakdown.get(toolName) ?? 0;
    this.toolBreakdown.set(toolName, current + 1);
  }

  recordIteration(): void {
    this.iterations++;
  }

  recordCheckpoint(): void {
    this.checkpoints++;
  }

  recordRecovery(): void {
    this.recoveries++;
  }

  recordEvent(type: string, data?: unknown): void {
    this.eventTimeline.push({
      type,
      timestamp: Date.now(),
      data,
    });
  }

  finalize(): RuntimeMetricsSnapshot {
    return {
      totalTokens: this.totalTokens,
      totalToolCalls: this.totalToolCalls,
      iterations: this.iterations,
      duration: Date.now() - this.startTime,
      checkpoints: this.checkpoints,
      recoveries: this.recoveries,
      toolBreakdown: Object.fromEntries(this.toolBreakdown),
      eventTimeline: [...this.eventTimeline],
    };
  }

  reset(): void {
    this.totalTokens = 0;
    this.totalToolCalls = 0;
    this.iterations = 0;
    this.checkpoints = 0;
    this.recoveries = 0;
    this.toolBreakdown.clear();
    this.eventTimeline = [];
  }
}
