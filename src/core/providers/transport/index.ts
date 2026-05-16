/**
 * Transport layer exports
 */

import { HttpTransport } from "./httpTransport";
import { AuthTransport } from "./authTransport";
import { TimeoutTransport } from "./timeoutTransport";
import { RetryTransport } from "./retryTransport";
import { CircuitBreakerTransport } from "./circuitBreakerTransport";
import { TracingTransport } from "./tracingTransport";
import { MetricsTransport } from "./metricsTransport";
import type { Transport, TransportRequestOptions } from "./httpTransport";
import type { AuthConfig } from "./authTransport";
import type { RequestMetrics } from "./metricsTransport";
import type { RetryPolicy, CircuitBreakerPolicy } from "../litellm/litellmTypes";

export {
  HttpTransport,
  AuthTransport,
  TimeoutTransport,
  RetryTransport,
  CircuitBreakerTransport,
  TracingTransport,
  MetricsTransport,
};
export type { Transport, TransportRequestOptions, AuthConfig, RequestMetrics };

/**
 * Composable transport builder
 * Permite construir chain de middlewares
 */
export class TransportBuilder {
  private transport: Transport;

  constructor(baseTransport?: Transport) {
    this.transport = baseTransport ?? new HttpTransport();
  }

  withAuth(config: AuthConfig): this {
    this.transport = new AuthTransport(this.transport, config);
    return this;
  }

  withTimeout(timeoutMs: number): this {
    this.transport = new TimeoutTransport(this.transport, timeoutMs);
    return this;
  }

  withRetry(policy: RetryPolicy, logger?: {
    warn: (message: string, context?: Record<string, unknown>) => void;
  }): this {
    this.transport = new RetryTransport(this.transport, policy, logger);
    return this;
  }

  withCircuitBreaker(
    policy: CircuitBreakerPolicy,
    logger?: {
      warn: (message: string, context?: Record<string, unknown>) => void;
      info: (message: string, context?: Record<string, unknown>) => void;
    },
  ): this {
    this.transport = new CircuitBreakerTransport(this.transport, policy, logger);
    return this;
  }

  withTracing(): this {
    this.transport = new TracingTransport(this.transport);
    return this;
  }

  withMetrics(onMetric?: (metric: RequestMetrics) => void): this {
    this.transport = new MetricsTransport(this.transport, onMetric);
    return this;
  }

  build(): Transport {
    return this.transport;
  }
}
