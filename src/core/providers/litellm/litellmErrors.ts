/**
 * LiteLLM error hierarchy
 */

import { ProviderError } from "../types";

/**
 * Base LiteLLM error
 */
export class LiteLLMError extends ProviderError {
  constructor(
    message: string,
    code?: string,
    statusCode?: number,
    cause?: Error,
  ) {
    super(message, code, statusCode, cause);
    this.name = "LiteLLMError";
  }
}

/**
 * Authentication error (401/403)
 * NOT retryable - fail fast
 */
export class LiteLLMAuthError extends LiteLLMError {
  constructor(message: string, statusCode: number, cause?: Error) {
    super(message, "AUTH_ERROR", statusCode, cause);
    this.name = "LiteLLMAuthError";
  }
}

/**
 * Rate limit error (429)
 * Retryable with exponential backoff
 */
export class LiteLLMRateLimitError extends LiteLLMError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    cause?: Error,
  ) {
    super(message, "RATE_LIMIT", 429, cause);
    this.name = "LiteLLMRateLimitError";
  }
}

/**
 * Budget exceeded error (400 + "Budget has been exceeded")
 * NOT retryable - fail fast
 */
export class LiteLLMBudgetError extends LiteLLMError {
  constructor(message: string, cause?: Error) {
    super(message, "BUDGET_EXCEEDED", 400, cause);
    this.name = "LiteLLMBudgetError";
  }
}

/**
 * Timeout error (504, ETIMEDOUT)
 * Retryable with linear backoff
 */
export class LiteLLMTimeoutError extends LiteLLMError {
  constructor(message: string, cause?: Error) {
    super(message, "TIMEOUT", 504, cause);
    this.name = "LiteLLMTimeoutError";
  }
}

/**
 * SSE streaming error
 * May or may not be retryable depending on context
 */
export class LiteLLMStreamingError extends LiteLLMError {
  constructor(message: string, cause?: Error) {
    super(message, "STREAMING_ERROR", undefined, cause);
    this.name = "LiteLLMStreamingError";
  }
}

/**
 * Circuit breaker open error
 * NOT retryable - fail fast
 */
export class CircuitBreakerOpenError extends LiteLLMError {
  constructor(
    message: string,
    public readonly lastError?: Error,
  ) {
    super(message, "CIRCUIT_OPEN", 503);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Config validation error
 */
export class ConfigValidationError extends LiteLLMError {
  constructor(message: string) {
    super(message, "CONFIG_VALIDATION");
    this.name = "ConfigValidationError";
  }
}

/**
 * Tool call parse error
 */
export class ToolCallParseError extends LiteLLMError {
  constructor(message: string, cause?: Error) {
    super(message, "TOOL_PARSE_ERROR", undefined, cause);
    this.name = "ToolCallParseError";
  }
}

/**
 * Classify error from HTTP response or exception
 */
export function classifyError(
  error: unknown,
  response?: Response,
): LiteLLMError {
  if (error instanceof LiteLLMError) {
    return error;
  }

  if (response) {
    const status = response.status;

    if (status === 401 || status === 403) {
      return new LiteLLMAuthError(
        `Authentication failed: ${response.statusText}`,
        status,
        error instanceof Error ? error : undefined,
      );
    }

    if (status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      return new LiteLLMRateLimitError(
        "Rate limit exceeded",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
        error instanceof Error ? error : undefined,
      );
    }

    if (status === 400) {
      // Check for budget error (requires reading body)
      return new LiteLLMError(
        `Bad request: ${response.statusText}`,
        "BAD_REQUEST",
        400,
        error instanceof Error ? error : undefined,
      );
    }

    if (status === 504) {
      return new LiteLLMTimeoutError(
        "Request timeout",
        error instanceof Error ? error : undefined,
      );
    }

    if (status >= 500) {
      return new LiteLLMError(
        `Server error: ${response.statusText}`,
        "SERVER_ERROR",
        status,
        error instanceof Error ? error : undefined,
      );
    }
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new LiteLLMError(
        "Request cancelled",
        "CANCELLED",
        undefined,
        error,
      );
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return new LiteLLMError(
        "Network error - check Z-scaler and TR network connectivity",
        "NETWORK_ERROR",
        undefined,
        error,
      );
    }

    if (error.message.includes("timeout")) {
      return new LiteLLMTimeoutError(error.message, error);
    }

    return new LiteLLMError(error.message, "UNKNOWN", undefined, error);
  }

  return new LiteLLMError("Unknown error occurred", "UNKNOWN");
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: LiteLLMError): boolean {
  // NOT retryable
  if (
    error instanceof LiteLLMAuthError ||
    error instanceof LiteLLMBudgetError ||
    error instanceof CircuitBreakerOpenError ||
    error instanceof ConfigValidationError
  ) {
    return false;
  }

  // Retryable
  if (
    error instanceof LiteLLMRateLimitError ||
    error instanceof LiteLLMTimeoutError
  ) {
    return true;
  }

  // Server errors (5xx) são retryable
  if (error.statusCode && error.statusCode >= 500) {
    return true;
  }

  // Default: não retryable
  return false;
}

/**
 * Detect budget error from response body
 */
export async function detectBudgetError(
  response: Response,
): Promise<LiteLLMError | null> {
  if (response.status !== 400) {
    return null;
  }

  try {
    const body = await response.clone().text();
    if (body.toLowerCase().includes("budget has been exceeded")) {
      return new LiteLLMBudgetError(
        "Monthly budget of $1000 exceeded. Check dashboard for reset date.",
      );
    }
  } catch {
    // Ignore body parse errors
  }

  return null;
}
