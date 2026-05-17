/**
 * Finish reason normalization - vendors usam diferentes valores
 */

/**
 * Canonical finish reasons
 */
export type CanonicalFinishReason =
  | "stop"
  | "max_tokens"
  | "tool_calls"
  | "error"
  | "cancelled";

/**
 * Normalize finish reason de diferentes vendors
 */
export function normalizeFinishReason(
  reason: string | null | undefined,
  _vendor?: string,
): CanonicalFinishReason {
  if (!reason) {
    return "stop";
  }

  const normalized = reason.toLowerCase();

  // Stop reasons
  if (
    normalized === "stop" ||
    normalized === "end_turn" ||
    normalized === "eos" ||
    normalized === "stop_sequence"
  ) {
    return "stop";
  }

  // Max tokens
  if (
    normalized === "length" ||
    normalized === "max_tokens" ||
    normalized === "max_length" ||
    normalized === "token_limit"
  ) {
    return "max_tokens";
  }

  // Tool calls
  if (
    normalized === "tool_calls" ||
    normalized === "function_call" ||
    normalized === "tool_use"
  ) {
    return "tool_calls";
  }

  // Error
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "content_filter"
  ) {
    return "error";
  }

  // Cancelled
  if (
    normalized === "cancelled" ||
    normalized === "aborted" ||
    normalized === "interrupted"
  ) {
    return "cancelled";
  }

  // Default
  return "stop";
}
