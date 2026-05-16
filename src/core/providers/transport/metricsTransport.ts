/**
 * Metrics transport - collects request metrics
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";

export interface RequestMetrics {
  readonly url: string;
  readonly method: string;
  readonly status?: number;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
  readonly timestamp: number;
}

/**
 * Metrics transport middleware - coleta métricas de requests
 */
export class MetricsTransport implements Transport {
  private metrics: RequestMetrics[] = [];

  constructor(
    private readonly inner: Transport,
    private readonly onMetric?: (metric: RequestMetrics) => void,
  ) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    const startTime = Date.now();

    try {
      const response = await this.inner.request(url, options, signal);
      const duration = Date.now() - startTime;

      const metric: RequestMetrics = {
        url,
        method: options.method,
        status: response.status,
        duration,
        success: response.ok,
        timestamp: Date.now(),
      };

      this.recordMetric(metric);
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      const metric: RequestMetrics = {
        url,
        method: options.method,
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      this.recordMetric(metric);
      throw error;
    }
  }

  private recordMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);
    this.onMetric?.(metric);
  }

  getMetrics(): readonly RequestMetrics[] {
    return this.metrics;
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  getAggregates() {
    if (this.metrics.length === 0) {
      return null;
    }

    const durations = this.metrics.map((m) => m.duration);
    const successCount = this.metrics.filter((m) => m.success).length;

    return {
      totalRequests: this.metrics.length,
      successCount,
      failureCount: this.metrics.length - successCount,
      successRate: successCount / this.metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: this.percentile(durations, 0.5),
      p95Duration: this.percentile(durations, 0.95),
      p99Duration: this.percentile(durations, 0.99),
    };
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] ?? 0;
  }
}
