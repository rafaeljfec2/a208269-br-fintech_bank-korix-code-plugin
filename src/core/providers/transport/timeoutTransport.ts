/**
 * Timeout transport - applies request timeout
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";
import { LiteLLMTimeoutError } from "../litellm/litellmErrors";

/**
 * Timeout transport middleware - aplica timeout em requests
 */
export class TimeoutTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly defaultTimeoutMs: number = 120000, // 2 min default
  ) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
  ): Promise<Response> {
    const timeoutMs = options.timeout ?? this.defaultTimeoutMs;
    const controller = new AbortController();

    // Merge signals (timeout + user cancellation)
    const mergedSignal = this.mergeSignals(controller.signal, signal);

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.inner.request(url, options, mergedSignal);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        // Check if abort was from timeout or user cancellation
        if (signal?.aborted) {
          // User cancellation
          throw error;
        }
        // Timeout
        throw new LiteLLMTimeoutError(
          `Request timeout after ${timeoutMs}ms`,
          error,
        );
      }

      throw error;
    }
  }

  private mergeSignals(
    timeoutSignal: AbortSignal,
    userSignal?: AbortSignal,
  ): AbortSignal {
    if (!userSignal) {
      return timeoutSignal;
    }

    const controller = new AbortController();

    const abortHandler = () => controller.abort();
    timeoutSignal.addEventListener("abort", abortHandler);
    userSignal.addEventListener("abort", abortHandler);

    return controller.signal;
  }
}
