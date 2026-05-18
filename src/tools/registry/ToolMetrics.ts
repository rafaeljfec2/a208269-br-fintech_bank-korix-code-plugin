/**
 * Tool Metrics - observability for tool execution
 *
 * Collects and aggregates metrics:
 * - Duration (p50, p95, p99)
 * - Cache hit rate
 * - Error rate
 * - Invocation count
 * - Input/output size
 */

export interface ToolMetric {
  readonly tool: string;
  readonly timestamp: number;
  readonly duration: number; // milliseconds
  readonly cached: boolean;
  readonly success: boolean;
  readonly inputSize: number; // bytes
  readonly outputSize: number; // bytes
  readonly error?: string;
}

export interface AggregatedMetrics {
  readonly tool: string;
  readonly invocations: number;
  readonly successes: number;
  readonly failures: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly successRate: number;
  readonly cacheHitRate: number;
  readonly duration: {
    readonly min: number;
    readonly max: number;
    readonly avg: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly avgInputSize: number;
  readonly avgOutputSize: number;
}

export interface GlobalMetrics {
  readonly totalInvocations: number;
  readonly totalSuccesses: number;
  readonly totalFailures: number;
  readonly totalCacheHits: number;
  readonly totalCacheMisses: number;
  readonly globalSuccessRate: number;
  readonly globalCacheHitRate: number;
  readonly avgDuration: number;
  readonly toolMetrics: Map<string, AggregatedMetrics>;
}

/**
 * Metrics collector with percentile calculation
 *
 * Stores metrics in memory with:
 * - Per-tool aggregation
 * - Sliding window (last N metrics)
 * - Efficient percentile calculation
 */
export class ToolMetrics {
  private readonly metrics: ToolMetric[] = [];
  private readonly maxMetrics: number;
  private readonly perToolMetrics: Map<string, ToolMetric[]> = new Map();

  constructor(maxMetrics = 10000) {
    this.maxMetrics = maxMetrics;
  }

  /**
   * Record a tool execution metric
   *
   * @param metric Tool metric to record
   */
  record(metric: ToolMetric): void {
    // Add to global metrics
    this.metrics.push(metric);

    // Add to per-tool metrics
    let toolMetrics = this.perToolMetrics.get(metric.tool);
    if (!toolMetrics) {
      toolMetrics = [];
      this.perToolMetrics.set(metric.tool, toolMetrics);
    }
    toolMetrics.push(metric);

    // Evict oldest if over limit (global)
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Evict oldest if over limit (per-tool)
    const perToolLimit =
      Math.floor(this.maxMetrics / this.perToolMetrics.size) || 100;
    if (toolMetrics.length > perToolLimit) {
      toolMetrics.shift();
    }
  }

  /**
   * Get aggregated metrics for a specific tool
   *
   * @param tool Tool name
   * @returns Aggregated metrics or null if no data
   */
  getMetrics(tool: string): AggregatedMetrics | null {
    const toolMetrics = this.perToolMetrics.get(tool);
    if (!toolMetrics || toolMetrics.length === 0) {
      return null;
    }

    return this.aggregateMetrics(tool, toolMetrics);
  }

  /**
   * Get global metrics for all tools
   *
   * @returns Global metrics with per-tool breakdown
   */
  getGlobalMetrics(): GlobalMetrics {
    const toolMetrics = new Map<string, AggregatedMetrics>();

    for (const [tool, metrics] of this.perToolMetrics.entries()) {
      toolMetrics.set(tool, this.aggregateMetrics(tool, metrics));
    }

    const totalInvocations = this.metrics.length;
    const totalSuccesses = this.metrics.filter((m) => m.success).length;
    const totalFailures = this.metrics.filter((m) => !m.success).length;
    const totalCacheHits = this.metrics.filter((m) => m.cached).length;
    const totalCacheMisses = this.metrics.filter((m) => !m.cached).length;

    const globalSuccessRate =
      totalInvocations > 0 ? totalSuccesses / totalInvocations : 0;
    const globalCacheHitRate =
      totalInvocations > 0 ? totalCacheHits / totalInvocations : 0;
    const avgDuration =
      totalInvocations > 0
        ? this.metrics.reduce((sum, m) => sum + m.duration, 0) /
          totalInvocations
        : 0;

    return {
      totalInvocations,
      totalSuccesses,
      totalFailures,
      totalCacheHits,
      totalCacheMisses,
      globalSuccessRate,
      globalCacheHitRate,
      avgDuration,
      toolMetrics,
    };
  }

  /**
   * Get timeline of metrics since timestamp
   *
   * @param since Timestamp in milliseconds
   * @returns Array of metrics since timestamp
   */
  getTimeline(since: number): ToolMetric[] {
    return this.metrics.filter((m) => m.timestamp >= since);
  }

  /**
   * Get timeline for specific tool
   *
   * @param tool Tool name
   * @param since Timestamp in milliseconds
   * @returns Array of metrics for tool since timestamp
   */
  getToolTimeline(tool: string, since: number): ToolMetric[] {
    const toolMetrics = this.perToolMetrics.get(tool);
    if (!toolMetrics) {
      return [];
    }

    return toolMetrics.filter((m) => m.timestamp >= since);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.length = 0;
    this.perToolMetrics.clear();
  }

  /**
   * Reset metrics for specific tool
   *
   * @param tool Tool name
   */
  resetTool(tool: string): void {
    this.perToolMetrics.delete(tool);

    // Remove from global metrics
    const indices: number[] = [];
    for (let i = 0; i < this.metrics.length; i++) {
      const metric = this.metrics[i];
      if (metric?.tool === tool) {
        indices.push(i);
      }
    }

    // Remove in reverse order to maintain indices
    for (let i = indices.length - 1; i >= 0; i--) {
      const index = indices[i];
      if (index !== undefined) {
        this.metrics.splice(index, 1);
      }
    }
  }

  /**
   * Aggregate metrics for a tool
   */
  private aggregateMetrics(
    tool: string,
    metrics: ToolMetric[],
  ): AggregatedMetrics {
    const invocations = metrics.length;
    const successes = metrics.filter((m) => m.success).length;
    const failures = metrics.filter((m) => !m.success).length;
    const cacheHits = metrics.filter((m) => m.cached).length;
    const cacheMisses = metrics.filter((m) => !m.cached).length;

    const successRate = invocations > 0 ? successes / invocations : 0;
    const cacheHitRate = invocations > 0 ? cacheHits / invocations : 0;

    // Duration stats
    const durations = metrics.map((m) => m.duration).sort((a, b) => a - b);
    const durationStats = {
      min: durations[0] ?? 0,
      max: durations[durations.length - 1] ?? 0,
      avg:
        durations.length > 0
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length
          : 0,
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
    };

    // Size stats
    const totalInputSize = metrics.reduce((sum, m) => sum + m.inputSize, 0);
    const totalOutputSize = metrics.reduce((sum, m) => sum + m.outputSize, 0);
    const avgInputSize = invocations > 0 ? totalInputSize / invocations : 0;
    const avgOutputSize = invocations > 0 ? totalOutputSize / invocations : 0;

    return {
      tool,
      invocations,
      successes,
      failures,
      cacheHits,
      cacheMisses,
      successRate,
      cacheHitRate,
      duration: durationStats,
      avgInputSize,
      avgOutputSize,
    };
  }

  /**
   * Calculate percentile from sorted array
   *
   * @param sortedArray Sorted array of numbers
   * @param percentile Percentile (0-100)
   * @returns Percentile value
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) {
      return 0;
    }

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] ?? 0;
  }

  /**
   * Export metrics as JSON (for debugging or persistence)
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        metrics: this.metrics,
        perToolMetrics: Array.from(this.perToolMetrics.entries()),
      },
      null,
      2,
    );
  }

  /**
   * Import metrics from JSON
   */
  importJSON(json: string): void {
    try {
      const data = JSON.parse(json) as {
        metrics: ToolMetric[];
        perToolMetrics: [string, ToolMetric[]][];
      };

      this.metrics.length = 0;
      this.metrics.push(...data.metrics);

      this.perToolMetrics.clear();
      for (const [tool, metrics] of data.perToolMetrics) {
        this.perToolMetrics.set(tool, metrics);
      }
    } catch (error: unknown) {
      throw new Error(`Failed to import metrics: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
}
