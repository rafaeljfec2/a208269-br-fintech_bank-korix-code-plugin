/**
 * Runtime events - structured event system
 *
 * All runtime state changes are emitted as typed events.
 * Event-driven architecture enables observability, debugging, and UI updates.
 */

import { EventEmitter } from "events";
import type { Disposable } from "./disposable";
import { SimpleDisposable } from "./disposable";
import type { RuntimeMetricsSnapshot } from "./runtimeTypes";
import type {
  EvidencePack,
  ExecutionGraphSnapshot,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingTimelineItem,
} from "./thinking/types";

/**
 * Lifecycle events
 */
export interface IterationStartEvent {
  readonly type: "iteration_start";
  readonly iteration: number;
  readonly timestamp: number;
}

export interface IterationCompleteEvent {
  readonly type: "iteration_complete";
  readonly iteration: number;
  readonly hadToolCalls: boolean;
  readonly duration: number;
  readonly timestamp: number;
}

export interface ExecutionCompleteEvent {
  readonly type: "execution_complete";
  readonly success: boolean;
  readonly iterations: number;
  readonly metrics: RuntimeMetricsSnapshot;
  readonly timestamp: number;
}

/**
 * Provider events (streaming)
 */
export interface TokenEvent {
  readonly type: "token";
  readonly content: string;
  readonly timestamp: number;
}

export interface ThinkingEvent {
  readonly type: "thinking";
  readonly content: string;
  readonly timestamp: number;
}

export interface ProviderRequestStartEvent {
  readonly type: "provider_request_start";
  readonly iteration: number;
  readonly correlationId: string;
  readonly toolCount: number;
  readonly toolChoice?: string;
  readonly timestamp: number;
}

export interface ProviderRequestEndEvent {
  readonly type: "provider_request_end";
  readonly iteration: number;
  readonly correlationId: string;
  readonly duration: number;
  readonly stopReason?: string;
  readonly tokenCount: number;
  readonly hadToolCalls: boolean;
  readonly timestamp: number;
}

export interface ProviderFirstOutputEvent {
  readonly type: "provider_first_output";
  readonly iteration: number;
  readonly correlationId: string;
  readonly outputKind: "token" | "thinking" | "tool_call";
  readonly latency: number;
  readonly timestamp: number;
}

/**
 * Safe thinking/orchestration events
 */
export interface ThinkingStepEvent {
  readonly type: "thinking_step";
  readonly item: ThinkingTimelineItem;
  readonly timestamp: number;
}

export interface ContextEvidenceEvent {
  readonly type: "context_evidence";
  readonly evidence: EvidencePack;
  readonly timestamp: number;
}

export interface ObservationSummaryEvent {
  readonly type: "observation_summary";
  readonly summary: ObservationSummary;
  readonly timestamp: number;
}

export interface ReflectionSummaryEvent {
  readonly type: "reflection_summary";
  readonly item: ThinkingTimelineItem;
  readonly timestamp: number;
}

export interface ResponseValidationEvent {
  readonly type: "response_validation";
  readonly validation: ResponseValidationResult;
  readonly timestamp: number;
}

export interface ResponseBufferStartEvent {
  readonly type: "response_buffer_start";
  readonly reason: "workspace_evidence_validation";
  readonly timestamp: number;
}

export interface ResponseBufferFlushEvent {
  readonly type: "response_buffer_flush";
  readonly reason: "validated" | "blocked" | "empty";
  readonly duration: number;
  readonly responseLength: number;
  readonly timestamp: number;
}

export interface ExecutionGraphUpdateEvent {
  readonly type: "execution_graph_update";
  readonly graph: ExecutionGraphSnapshot;
  readonly timestamp: number;
}

export interface DoneEvent {
  readonly type: "done";
  readonly stopReason?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly timestamp: number;
}

/**
 * Tool events
 */
export interface ToolCallEvent {
  readonly type: "tool_call";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly timestamp: number;
}

export interface ToolResultEvent {
  readonly type: "tool_result";
  readonly id: string;
  readonly name: string;
  readonly success: boolean;
  readonly result: unknown;
  readonly duration: number;
  readonly timestamp: number;
}

export interface ToolApprovalRequiredEvent {
  readonly type: "tool_approval_required";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly timestamp: number;
}

export interface ToolApprovedEvent {
  readonly type: "tool_approved";
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly timestamp: number;
}

export interface ToolDeniedEvent {
  readonly type: "tool_denied";
  readonly id: string;
  readonly name: string;
  readonly reason: string;
  readonly duration: number;
  readonly timestamp: number;
}

/**
 * Patch events
 */
export interface PatchAppliedEvent {
  readonly type: "patch_applied";
  readonly file: string;
  readonly lineNumber: number;
  readonly operation: "insert" | "replace" | "delete";
  readonly timestamp: number;
}

export interface PatchFailedEvent {
  readonly type: "patch_failed";
  readonly file: string;
  readonly error: string;
  readonly timestamp: number;
}

/**
 * Checkpoint events
 */
export interface CheckpointCreatedEvent {
  readonly type: "checkpoint_created";
  readonly checkpointId: string;
  readonly iteration: number;
  readonly filesChanged: number;
  readonly timestamp: number;
}

export interface CheckpointRestoredEvent {
  readonly type: "checkpoint_restored";
  readonly checkpointId: string;
  readonly iteration: number;
  readonly timestamp: number;
}

/**
 * Error & recovery events
 */
export interface ErrorEvent {
  readonly type: "error";
  readonly error: string;
  readonly iteration: number;
  readonly recoverable: boolean;
  readonly timestamp: number;
}

export interface RecoveryStartedEvent {
  readonly type: "recovery_started";
  readonly action: "retry" | "rollback" | "fail";
  readonly attempt: number;
  readonly timestamp: number;
}

export interface RecoveryCompleteEvent {
  readonly type: "recovery_complete";
  readonly action: "retry" | "rollback" | "fail";
  readonly success: boolean;
  readonly timestamp: number;
}

/**
 * Guard events (loop prevention)
 */
export interface StallDetectedEvent {
  readonly type: "stall_detected";
  readonly iteration: number;
  readonly timeSinceActivity: number;
  readonly timestamp: number;
}

export interface DuplicateToolDetectedEvent {
  readonly type: "duplicate_tool_detected";
  readonly toolName: string;
  readonly count: number;
  readonly timestamp: number;
}

export interface LoopWarningEvent {
  readonly type: "loop_warning";
  readonly reason: string;
  readonly iteration: number;
  readonly timestamp: number;
}

/**
 * Control events
 */
export interface CancelledEvent {
  readonly type: "cancelled";
  readonly reason: string;
  readonly iteration: number;
  readonly timestamp: number;
}

export interface PausedEvent {
  readonly type: "paused";
  readonly iteration: number;
  readonly timestamp: number;
}

export interface ResumedEvent {
  readonly type: "resumed";
  readonly iteration: number;
  readonly timestamp: number;
}

/**
 * User interaction events
 */
export interface UserQuestionEvent {
  readonly type: "user_question";
  readonly questionId: string;
  readonly title: string;
  readonly question: string;
  readonly mode: "single" | "multiple";
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly description: string;
  }[];
  readonly timeoutMs?: number;
  readonly defaultAnswer?: string | string[];
  readonly timestamp: number;
}

export interface UserAnswerEvent {
  readonly type: "user_answer";
  readonly questionId: string;
  readonly answers: string[];
  readonly isTimeout: boolean;
  readonly timestamp: number;
}

/**
 * Union of all runtime events
 */
export type RuntimeEvent =
  // Lifecycle
  | IterationStartEvent
  | IterationCompleteEvent
  | ExecutionCompleteEvent
  // Provider
  | TokenEvent
  | ThinkingEvent
  | ProviderRequestStartEvent
  | ProviderRequestEndEvent
  | ProviderFirstOutputEvent
  // Safe thinking orchestration
  | ThinkingStepEvent
  | ContextEvidenceEvent
  | ObservationSummaryEvent
  | ReflectionSummaryEvent
  | ResponseValidationEvent
  | ResponseBufferStartEvent
  | ResponseBufferFlushEvent
  | ExecutionGraphUpdateEvent
  | DoneEvent
  // Tools
  | ToolCallEvent
  | ToolResultEvent
  | ToolApprovalRequiredEvent
  | ToolApprovedEvent
  | ToolDeniedEvent
  // Patches
  | PatchAppliedEvent
  | PatchFailedEvent
  // Checkpoints
  | CheckpointCreatedEvent
  | CheckpointRestoredEvent
  // Errors & recovery
  | ErrorEvent
  | RecoveryStartedEvent
  | RecoveryCompleteEvent
  // Guards
  | StallDetectedEvent
  | DuplicateToolDetectedEvent
  | LoopWarningEvent
  // Control
  | CancelledEvent
  | PausedEvent
  | ResumedEvent
  // User interaction
  | UserQuestionEvent
  | UserAnswerEvent;

/**
 * Typed event emitter for runtime events
 */
export class RuntimeEventEmitter extends EventEmitter {
  private responseBuffering = false;
  private readonly responseBuffer: TokenEvent[] = [];

  /**
   * Emit a runtime event
   */
  emitEvent(event: RuntimeEvent): boolean {
    if (event.type === "token" && this.responseBuffering) {
      this.responseBuffer.push(event);
      return true;
    }

    return super.emit("event", event);
  }

  beginResponseBuffering(): void {
    this.responseBuffering = true;
    this.responseBuffer.length = 0;
  }

  endResponseBuffering(): void {
    this.responseBuffering = false;
    this.responseBuffer.length = 0;
  }

  getBufferedResponse(): string {
    return this.responseBuffer.map((event) => event.content).join("");
  }

  isResponseBufferingEmpty(): boolean {
    return this.responseBuffer.length === 0;
  }

  clearBufferedResponse(): void {
    this.responseBuffer.length = 0;
  }

  flushBufferedResponse(replacementText?: string): void {
    const text = replacementText ?? this.getBufferedResponse();
    const timestamp = Date.now();

    this.responseBuffering = false;
    this.responseBuffer.length = 0;

    if (text.length === 0) {
      return;
    }

    super.emit("event", {
      type: "token",
      content: text,
      timestamp,
    } satisfies TokenEvent);
  }

  /**
   * Listen to all runtime events
   * Returns a Disposable that removes the listener when disposed
   */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    this.on("event", listener);
    return new SimpleDisposable(() => {
      this.off("event", listener);
    });
  }

  /**
   * Listen to specific event types
   * Returns a Disposable that removes the listener when disposed
   */
  onType<T extends RuntimeEvent["type"]>(
    type: T,
    listener: (event: Extract<RuntimeEvent, { type: T }>) => void,
  ): Disposable {
    return this.onEvent((event) => {
      if (event.type === type) {
        listener(event as Extract<RuntimeEvent, { type: T }>);
      }
    });
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(eventName?: string | symbol): this {
    return super.removeAllListeners(eventName);
  }
}
