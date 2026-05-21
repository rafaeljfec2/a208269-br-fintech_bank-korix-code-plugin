/**
 * Runtime metrics collection
 */

import type { Logger } from "../../telemetry/logger";
import type {
  RuntimeMetricsSnapshot,
  RuntimeEventRecord,
} from "./runtimeTypes";

export class RuntimeMetrics {
  private totalTokens = 0;
  private totalToolCalls = 0;
  private iterations = 0;
  private checkpoints = 0;
  private recoveries = 0;
  private providerDurationMs = 0;
  private providerFirstOutputLatencyMs = 0;
  private toolDurationMs = 0;
  private approvalWaitMs = 0;
  private responseBufferDurationMs = 0;
  private toolBreakdown = new Map<string, number>();
  private eventTimeline: RuntimeEventRecord[] = [];
  private readonly startTime: number;

  // @ts-expect-error - Reserved for future use
  constructor(private readonly __logger: Logger) {
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

  recordProviderDuration(durationMs: number): void {
    this.providerDurationMs += Math.max(0, durationMs);
  }

  recordProviderFirstOutputLatency(latencyMs: number): void {
    this.providerFirstOutputLatencyMs += Math.max(0, latencyMs);
  }

  recordToolDuration(durationMs: number): void {
    this.toolDurationMs += Math.max(0, durationMs);
  }

  recordApprovalWait(durationMs: number): void {
    this.approvalWaitMs += Math.max(0, durationMs);
  }

  recordResponseBufferDuration(durationMs: number): void {
    this.responseBufferDurationMs += Math.max(0, durationMs);
  }

  recordEvent(type: string, data?: unknown): void {
    this.eventTimeline.push({
      type,
      timestamp: Date.now(),
      data,
    });
  }

  finalize(): RuntimeMetricsSnapshot {
    const duration = Date.now() - this.startTime;
    const measuredLatency =
      this.providerDurationMs +
      this.toolDurationMs +
      this.approvalWaitMs +
      this.responseBufferDurationMs;

    return {
      totalTokens: this.totalTokens,
      totalToolCalls: this.totalToolCalls,
      iterations: this.iterations,
      duration,
      checkpoints: this.checkpoints,
      recoveries: this.recoveries,
      toolBreakdown: Object.fromEntries(this.toolBreakdown),
      eventTimeline: [...this.eventTimeline],
      latency: {
        providerDurationMs: this.providerDurationMs,
        providerFirstOutputLatencyMs: this.providerFirstOutputLatencyMs,
        toolDurationMs: this.toolDurationMs,
        approvalWaitMs: this.approvalWaitMs,
        responseBufferDurationMs: this.responseBufferDurationMs,
        iterationOverheadMs: Math.max(0, duration - measuredLatency),
      },
    };
  }

  reset(): void {
    this.totalTokens = 0;
    this.totalToolCalls = 0;
    this.iterations = 0;
    this.checkpoints = 0;
    this.recoveries = 0;
    this.providerDurationMs = 0;
    this.providerFirstOutputLatencyMs = 0;
    this.toolDurationMs = 0;
    this.approvalWaitMs = 0;
    this.responseBufferDurationMs = 0;
    this.toolBreakdown.clear();
    this.eventTimeline = [];
  }
}
