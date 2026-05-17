/**
 * Runtime domain types
 *
 * Core types for the Agent Runtime event-driven execution system.
 * NO dependencies except core/types.
 */

import type { Message, ExecutionContext } from "../types";

/**
 * Task to be executed by the agent runtime
 */
export interface Task {
  readonly id: string;
  readonly type: "user_request" | "scheduled" | "retry";
  readonly priority: number; // Higher = more urgent
  readonly prompt: string;
  readonly context: ExecutionContext;
  readonly createdAt: number;
  readonly maxIterations?: number;
}

/**
 * Result of a single execution step (one iteration)
 */
export interface StepResult {
  hadToolCalls: boolean;
  hadThinking: boolean;
  tokenCount: number;
  stopReason?: "end_turn" | "max_tokens" | "stop_sequence";
  error?: string;
  recoverable: boolean;
}

/**
 * Final result of agent loop execution
 */
export interface AgentLoopResult {
  readonly success: boolean;
  readonly iterations: number;
  readonly finalState: RuntimeStateSnapshot;
  readonly metrics: RuntimeMetricsSnapshot;
  readonly error?: string;
}

/**
 * Runtime metrics snapshot (immutable)
 */
export interface RuntimeMetricsSnapshot {
  readonly totalTokens: number;
  readonly totalToolCalls: number;
  readonly iterations: number;
  readonly duration: number;
  readonly checkpoints: number;
  readonly recoveries: number;
  readonly toolBreakdown: Readonly<Record<string, number>>;
  readonly eventTimeline: readonly RuntimeEventRecord[];
}

/**
 * Event record in timeline
 */
export interface RuntimeEventRecord {
  readonly type: string;
  readonly timestamp: number;
  readonly data?: unknown;
}

/**
 * File snapshot for checkpoints (incremental)
 */
export interface FileSnapshot {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
  readonly timestamp: number;
}

/**
 * Runtime checkpoint (incremental, file-scoped)
 */
export interface RuntimeCheckpoint {
  readonly id: string;
  readonly iteration: number;
  readonly timestamp: number;
  readonly modifiedFiles: readonly FileSnapshot[];
  readonly operationJournal: readonly Operation[];
  readonly memoryState: MemorySnapshot;
  readonly conversationSnapshot: readonly Message[];
}

/**
 * Operation executed during runtime
 */
export interface Operation {
  readonly type: "tool_call" | "file_write" | "file_edit" | "command_run";
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly filePath?: string;
  readonly timestamp: number;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Memory state snapshot
 */
export interface MemorySnapshot {
  readonly shortTerm: ReadonlyMap<string, unknown>;
  readonly conversationContext: readonly string[];
  readonly lastCheckpointId?: string;
}

/**
 * Runtime state snapshot (full state)
 */
export interface RuntimeStateSnapshot {
  readonly conversation: ConversationStateSnapshot;
  readonly execution: ExecutionStateSnapshot;
  readonly workspace: WorkspaceStateSnapshot;
  readonly memory: MemorySnapshot;
  readonly correlationId: string;
}

/**
 * Conversation state snapshot
 */
export interface ConversationStateSnapshot {
  readonly messages: readonly Message[];
  readonly turnCount: number;
  readonly toolCallHistory: readonly ToolCallRecord[];
}

/**
 * Tool call record
 */
export interface ToolCallRecord {
  readonly id: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly result: unknown;
  readonly timestamp: number;
  readonly duration: number;
  readonly success: boolean;
}

/**
 * Execution state snapshot
 */
export interface ExecutionStateSnapshot {
  readonly isExecuting: boolean;
  readonly currentIteration: number;
  readonly maxIterations: number;
  readonly startTime: number;
  readonly lastActivityTime: number;
}

/**
 * Workspace state snapshot
 */
export interface WorkspaceStateSnapshot {
  readonly root: string;
  readonly currentFile?: string;
  readonly selection?: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
    readonly text: string;
  };
  readonly openFiles: readonly string[];
  readonly modifiedFiles: ReadonlySet<string>;
}

/**
 * Retry strategy types
 */
export type RetryStrategy = "exponential" | "linear" | "immediate";

/**
 * Retry configuration
 */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly strategy: RetryStrategy;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Recovery action types
 */
export type RecoveryActionType = "retry" | "rollback" | "fail";

/**
 * Recovery action
 */
export interface RecoveryAction {
  readonly action: RecoveryActionType;
  readonly delayMs?: number;
  readonly checkpointId?: string;
  readonly error?: Error;
}

/**
 * Progress marker for guard detection
 */
export interface ProgressMarker {
  readonly iteration: number;
  readonly modifiedFiles: number;
  readonly toolCallCount: number;
  readonly timestamp: number;
}

/**
 * Guard result
 */
export interface GuardResult {
  readonly shouldStop: boolean;
  readonly reason?:
    | "max_iterations"
    | "stalled"
    | "duplicate_tools"
    | "no_progress";
  readonly message?: string;
}
