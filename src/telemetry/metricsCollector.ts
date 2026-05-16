/**
 * Metrics Collector - aggregates metrics from ToolMetrics
 *
 * Provides:
 * - Real-time metrics dashboard
 * - Performance monitoring
 * - Error tracking
 * - Cache efficiency monitoring
 */

import type { ToolMetrics, AggregatedMetrics, GlobalMetrics } from '../tools/registry/ToolMetrics';
import type { ToolCache } from '../tools/registry/ToolCache';

export interface MetricsDashboard {
  readonly timestamp: number;
  readonly globalMetrics: GlobalMetrics;
  readonly cacheStats: {
    readonly hitRate: number;
    readonly currentSize: number;
    readonly currentEntries: number;
    readonly evictions: number;
  };
  readonly topTools: readonly {
    readonly tool: string;
    readonly invocations: number;
    readonly avgDuration: number;
    readonly errorRate: number;
  }[];
  readonly slowestTools: readonly {
    readonly tool: string;
    readonly p99Duration: number;
    readonly avgDuration: number;
  }[];
  readonly errorTools: readonly {
    readonly tool: string;
    readonly errorRate: number;
    readonly failures: number;
  }[];
}

/**
 * Metrics collector for real-time monitoring
 *
 * Aggregates data from:
 * - ToolMetrics (execution stats)
 * - ToolCache (cache efficiency)
 *
 * Provides dashboard data for UI visualization
 */
export class MetricsCollector {
  constructor(
    private readonly toolMetrics: ToolMetrics,
    private readonly toolCache: ToolCache
  ) {}

  /**
   * Get current metrics dashboard
   */
  getDashboard(): MetricsDashboard {
    const globalMetrics = this.toolMetrics.getGlobalMetrics();
    const cacheStats = this.toolCache.getStats();

    // Top tools by invocation count
    const topTools = this.getTopTools(globalMetrics);

    // Slowest tools by p99 duration
    const slowestTools = this.getSlowestTools(globalMetrics);

    // Tools with highest error rate
    const errorTools = this.getErrorTools(globalMetrics);

    return {
      timestamp: Date.now(),
      globalMetrics,
      cacheStats: {
        hitRate: cacheStats.hitRate,
        currentSize: cacheStats.currentSize,
        currentEntries: cacheStats.currentEntries,
        evictions: cacheStats.evictions,
      },
      topTools,
      slowestTools,
      errorTools,
    };
  }

  /**
   * Get top tools by invocation count
   */
  private getTopTools(globalMetrics: GlobalMetrics): Array<{
    tool: string;
    invocations: number;
    avgDuration: number;
    errorRate: number;
  }> {
    const tools = Array.from(globalMetrics.toolMetrics.entries())
      .map(([tool, metrics]) => ({
        tool,
        invocations: metrics.invocations,
        avgDuration: metrics.duration.avg,
        errorRate: metrics.failures / metrics.invocations,
      }))
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, 10);

    return tools;
  }

  /**
   * Get slowest tools by p99 duration
   */
  private getSlowestTools(globalMetrics: GlobalMetrics): Array<{
    tool: string;
    p99Duration: number;
    avgDuration: number;
  }> {
    const tools = Array.from(globalMetrics.toolMetrics.entries())
      .map(([tool, metrics]) => ({
        tool,
        p99Duration: metrics.duration.p99,
        avgDuration: metrics.duration.avg,
      }))
      .sort((a, b) => b.p99Duration - a.p99Duration)
      .slice(0, 10);

    return tools;
  }

  /**
   * Get tools with highest error rate
   */
  private getErrorTools(globalMetrics: GlobalMetrics): Array<{
    tool: string;
    errorRate: number;
    failures: number;
  }> {
    const tools = Array.from(globalMetrics.toolMetrics.entries())
      .map(([tool, metrics]) => ({
        tool,
        errorRate: metrics.failures / metrics.invocations,
        failures: metrics.failures,
      }))
      .filter(t => t.failures > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10);

    return tools;
  }

  /**
   * Get metrics for specific tool
   */
  getToolMetrics(tool: string): AggregatedMetrics | null {
    return this.toolMetrics.getMetrics(tool);
  }

  /**
   * Get metrics timeline since timestamp
   */
  getTimeline(since: number): ReturnType<ToolMetrics['getTimeline']> {
    return this.toolMetrics.getTimeline(since);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.toolMetrics.reset();
    this.toolCache.getStats(); // Just to trigger any cleanup
  }

  /**
   * Export metrics as JSON
   */
  exportJSON(): string {
    const dashboard = this.getDashboard();
    return JSON.stringify(dashboard, null, 2);
  }
}
