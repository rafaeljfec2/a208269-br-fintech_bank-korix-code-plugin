/**
 * ToolCallAssembler - reconstrução de tool calls fragmentados
 * Mantém estado de reconstrução (FORA do provider)
 */

import type {
  ProviderEvent,
  ToolCallDeltaEvent,
  ToolCallCompleteEvent,
} from "../../providers/types";

/**
 * Partial tool call em reconstrução
 */
interface PartialToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Complete tool call - pronto para execução
 */
export interface CompleteToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/**
 * Tool call assembly result
 */
export type AssemblyResult =
  | { type: "incomplete" } // Ainda acumulando deltas
  | { type: "complete"; toolCall: CompleteToolCall } // Tool call completo
  | { type: "error"; error: Error }; // Parse error

/**
 * ToolCallAssembler - state machine para reconstrução de tool calls
 * Esta classe DEVE estar no runtime layer, NÃO no provider
 */
export class ToolCallAssembler {
  private activeToolCalls = new Map<number, PartialToolCall>();

  /**
   * Process ProviderEvent e retorna tool call completo quando pronto
   */
  process(event: ProviderEvent): AssemblyResult[] {
    switch (event.type) {
      case "tool_call_delta":
        return [this.accumulate(event)];

      case "tool_call_complete":
        return [this.complete(event)];

      case "finish":
        // Finalize all pending tool calls se finish reason = tool_calls
        if (event.reason === "tool_calls") {
          return this.finalizeAll();
        }
        return [];

      default:
        return [];
    }
  }

  /**
   * Accumulate tool call delta
   */
  private accumulate(delta: ToolCallDeltaEvent): AssemblyResult {
    const existing = this.activeToolCalls.get(delta.index) ?? {
      id: delta.id ?? "",
      name: delta.name ?? "",
      arguments: "",
    };

    // Update fields
    if (delta.id) existing.id = delta.id;
    if (delta.name) existing.name = delta.name;
    if (delta.argumentsChunk) existing.arguments += delta.argumentsChunk;

    this.activeToolCalls.set(delta.index, existing);

    return { type: "incomplete" };
  }

  /**
   * Complete tool call - provider enviou completo
   */
  private complete(event: ToolCallCompleteEvent): AssemblyResult {
    try {
      const input = parseToolArguments(event.arguments);
      return {
        type: "complete",
        toolCall: {
          id: event.id,
          name: event.name,
          input,
        },
      };
    } catch (error) {
      return {
        type: "error",
        error: new Error(
          `Failed to parse tool call arguments for ${event.name}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }
  }

  /**
   * Finalize todos os tool calls pendentes
   */
  private finalizeAll(): AssemblyResult[] {
    const results: AssemblyResult[] = [];

    for (const [index, partial] of this.activeToolCalls) {
      try {
        const input = parseToolArguments(partial.arguments);
        results.push({
          type: "complete",
          toolCall: {
            id: partial.id,
            name: partial.name,
            input,
          },
        });
      } catch (error) {
        results.push({
          type: "error",
          error: new Error(
            `Failed to parse tool call arguments at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        });
      }
    }

    this.activeToolCalls.clear();
    return results;
  }

  /**
   * Reset state (call no início de novo request)
   */
  reset(): void {
    this.activeToolCalls.clear();
  }

  /**
   * Get current state (para debugging)
   */
  getState() {
    return {
      activeCount: this.activeToolCalls.size,
      pending: Array.from(this.activeToolCalls.entries()).map(
        ([index, tc]) => ({
          index,
          id: tc.id,
          name: tc.name,
          argumentsLength: tc.arguments.length,
        }),
      ),
    };
  }
}

function parseToolArguments(argumentsText: string): Record<string, unknown> {
  if (argumentsText.trim().length === 0) {
    return {};
  }

  return JSON.parse(argumentsText) as Record<string, unknown>;
}
