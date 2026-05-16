/**
 * Circuit breaker transport - prevents cascading failures
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";
import type { CircuitBreakerPolicy } from "../litellm/litellmTypes";
import { CircuitState } from "../litellm/litellmTypes";
import { CircuitBreakerOpenError } from "../litellm/litellmErrors";

/**
 * Circuit breaker transport middleware
 * Implementa padrão circuit breaker para prevenir cascading failures
 */
export class CircuitBreakerTransport implements Transport {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastOpenTime?: number;
  private lastError?: Error;

  constructor(
    private readonly inner: Transport,
    private readonly policy: CircuitBreakerPolicy,
    private readonly logger?: {
      warn: (message: string, context?: Record<string, unknown>) => void;
      info: (message: string, context?: Record<string, unknown>) => void;
    },
  ) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    // Check circuit state before request
    if (this.state === CircuitState.OPEN) {
      // Check if should transition to HALF_OPEN
      if (
        this.lastOpenTime &&
        Date.now() - this.lastOpenTime > this.policy.openDuration
      ) {
        this.transition(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker open for ${url}`,
          this.lastError,
        );
      }
    }

    // HALF_OPEN state: limit concurrent requests
    if (
      this.state === CircuitState.HALF_OPEN &&
      this.successes >= this.policy.halfOpenMaxRequests
    ) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker half-open, max requests exceeded`,
        this.lastError,
      );
    }

    try {
      const response = await this.inner.request(url, options, signal);

      // Check if response is error
      if (!response.ok && response.status >= 500) {
        this.onFailure(new Error(`HTTP ${response.status}`));
        return response;
      }

      this.onSuccess();
      return response;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes++;

    if (
      this.state === CircuitState.HALF_OPEN &&
      this.successes >= this.policy.successThreshold
    ) {
      this.transition(CircuitState.CLOSED);
    }
  }

  private onFailure(error: Error): void {
    this.successes = 0;
    this.failures++;
    this.lastError = error;

    if (this.failures >= this.policy.failureThreshold) {
      this.transition(CircuitState.OPEN);
      this.lastOpenTime = Date.now();
    }
  }

  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    this.logger?.info("Circuit breaker state transition", {
      from: oldState,
      to: newState,
      failures: this.failures,
      successes: this.successes,
    });

    // Reset counters on transition
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastOpenTime: this.lastOpenTime,
    };
  }
}
