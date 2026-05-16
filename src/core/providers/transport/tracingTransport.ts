/**
 * Tracing transport - injects correlation headers
 */

import type { Transport, TransportRequestOptions } from "./httpTransport";
import type { CorrelationContext } from "../types";

/**
 * Tracing transport middleware - injeta correlation headers para distributed tracing
 */
export class TracingTransport implements Transport {
  constructor(private readonly inner: Transport) {}

  async request(
    url: string,
    options: TransportRequestOptions,
    signal?: AbortSignal,
    correlation?: CorrelationContext,
  ): Promise<Response> {
    const headers = {
      ...options.headers,
      ...(correlation
        ? this.buildTracingHeaders(correlation)
        : {}),
    };

    return this.inner.request(
      url,
      { ...options, headers },
      signal,
    );
  }

  private buildTracingHeaders(
    correlation: CorrelationContext,
  ): Record<string, string> {
    return {
      "x-correlation-id": correlation.correlationId,
      "x-session-id": correlation.sessionId,
      ...(correlation.agentRunId
        ? { "x-agent-run-id": correlation.agentRunId }
        : {}),
      ...(correlation.iterationId !== undefined
        ? { "x-iteration-id": correlation.iterationId.toString() }
        : {}),
      ...(correlation.requestId
        ? { "x-request-id": correlation.requestId }
        : {}),
    };
  }
}
