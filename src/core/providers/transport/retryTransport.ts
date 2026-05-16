/**
 * Retry transport - exponential backoff retry logic
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";
import type { RetryPolicy } from "../litellm/litellmTypes";
import { isRetryableError, classifyError } from "../litellm/litellmErrors";

/**
 * Retry transport middleware - implementa exponential backoff
 */
export class RetryTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly policy: RetryPolicy,
    private readonly logger?: {
      warn: (message: string, context?: Record<string, unknown>) => void;
    },
  ) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < this.policy.maxAttempts) {
      try {
        const response = await this.inner.request(url, options, signal);

        // Check for retryable status codes
        if (
          !response.ok &&
          this.policy.retryableStatuses.includes(response.status) &&
          attempt < this.policy.maxAttempts - 1
        ) {
          this.logger?.warn("Retryable HTTP error", {
            attempt: attempt + 1,
            maxAttempts: this.policy.maxAttempts,
            status: response.status,
            url,
          });

          await this.backoff(attempt);
          attempt++;
          continue;
        }

        return response;
      } catch (error) {
        const classified = classifyError(error);
        lastError = classified;

        // Check if cancellation
        if (signal?.aborted) {
          throw error;
        }

        // Check if retryable
        if (
          !isRetryableError(classified) ||
          attempt === this.policy.maxAttempts - 1
        ) {
          throw error;
        }

        this.logger?.warn("Retryable error", {
          attempt: attempt + 1,
          maxAttempts: this.policy.maxAttempts,
          errorType: classified.name,
          errorMessage: classified.message,
        });

        await this.backoff(attempt);
        attempt++;
      }
    }

    throw lastError ?? new Error("Max retry attempts exceeded");
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(
      this.policy.baseDelay * Math.pow(2, attempt) + this.jitter(),
      this.policy.maxDelay,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private jitter(): number {
    return Math.random() * 1000; // 0-1000ms jitter
  }
}
