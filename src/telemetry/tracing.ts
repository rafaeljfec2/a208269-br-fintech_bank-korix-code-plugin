/**
 * Execution Tracing - distributed tracing for tool calls
 *
 * Provides:
 * - Span-based tracing (parent/child relationships)
 * - Execution timeline
 * - Tool call graph visualization
 * - Performance profiling
 */

export interface Span {
  readonly id: string;
  readonly parentId?: string;
  readonly tool: string;
  readonly startTime: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly success?: boolean;
  readonly error?: string;
  readonly metadata: Record<string, unknown>;
}

export interface Trace {
  readonly rootSpanId: string;
  readonly spans: readonly Span[];
  readonly totalDuration: number;
  readonly success: boolean;
}

/**
 * Tracer for distributed tracing of tool executions
 *
 * Algorithm:
 * 1. Each tool execution creates a span
 * 2. Spans form a tree (parent/child relationships)
 * 3. Spans track timing and metadata
 * 4. Traces can be exported for visualization
 */
export class Tracer {
  private readonly spans: Map<string, Span> = new Map();
  private readonly activeSpans: Set<string> = new Set();

  /**
   * Start a new span
   *
   * @param tool Tool name
   * @param parentId Optional parent span ID
   * @param metadata Optional metadata
   * @returns Span ID
   */
  startSpan(tool: string, parentId?: string, metadata?: Record<string, unknown>): string {
    const spanId = this.generateSpanId();

    const span: Span = {
      id: spanId,
      parentId,
      tool,
      startTime: Date.now(),
      metadata: metadata ?? {},
    };

    this.spans.set(spanId, span);
    this.activeSpans.add(spanId);

    return spanId;
  }

  /**
   * End a span
   *
   * @param spanId Span ID
   * @param success Whether the operation succeeded
   * @param error Optional error message
   */
  endSpan(spanId: string, success = true, error?: string): void {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    const endTime = Date.now();
    const duration = endTime - span.startTime;

    // Update span
    const updatedSpan: Span = {
      ...span,
      endTime,
      duration,
      success,
      error,
    };

    this.spans.set(spanId, updatedSpan);
    this.activeSpans.delete(spanId);
  }

  /**
   * Get a span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get all spans for a trace (by root span ID)
   *
   * @param rootSpanId Root span ID
   * @returns Trace with all spans
   */
  getTrace(rootSpanId: string): Trace | null {
    const rootSpan = this.spans.get(rootSpanId);
    if (!rootSpan) {
      return null;
    }

    // Collect all spans in this trace
    const traceSpans: Span[] = [rootSpan];
    const toVisit = [rootSpanId];
    const visited = new Set<string>();

    while (toVisit.length > 0) {
      const currentId = toVisit.pop();
      if (!currentId || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      // Find child spans
      for (const [spanId, span] of this.spans.entries()) {
        if (span.parentId === currentId && !visited.has(spanId)) {
          traceSpans.push(span);
          toVisit.push(spanId);
        }
      }
    }

    // Calculate total duration
    const totalDuration = rootSpan.duration ?? 0;

    // Check if trace succeeded
    const success = traceSpans.every(s => s.success !== false);

    return {
      rootSpanId,
      spans: traceSpans,
      totalDuration,
      success,
    };
  }

  /**
   * Get all traces
   */
  getAllTraces(): Trace[] {
    const rootSpans = Array.from(this.spans.values()).filter(s => !s.parentId);
    return rootSpans.map(s => this.getTrace(s.id)).filter(t => t !== null);
  }

  /**
   * Get active spans (not yet ended)
   */
  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans)
      .map(id => this.spans.get(id))
      .filter(s => s !== undefined);
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.spans.clear();
    this.activeSpans.clear();
  }

  /**
   * Export traces as JSON (for visualization)
   */
  exportJSON(): string {
    const traces = this.getAllTraces();
    return JSON.stringify(traces, null, 2);
  }

  /**
   * Generate unique span ID
   */
  private generateSpanId(): string {
    return `span_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * Global tracer instance
 */
export const globalTracer = new Tracer();
