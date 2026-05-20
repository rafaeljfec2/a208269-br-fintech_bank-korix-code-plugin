/**
 * Runtime state management - modular, snapshot/restore capable
 *
 * State is split into 4 independent modules:
 * - Conversation (messages, tool calls)
 * - Execution (iteration, timing)
 * - Workspace (files, selection)
 * - Memory (short-term context, checkpoints)
 */

import type { Message, ExecutionContext } from "../types";
import type {
  RuntimeStateSnapshot,
  ConversationStateSnapshot,
  ExecutionStateSnapshot,
  WorkspaceStateSnapshot,
  MemorySnapshot,
  ToolCallRecord,
} from "./runtimeTypes";
import type {
  EvidencePack,
  ExecutionGraphSnapshot,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingRunProfile,
} from "./thinking/types";

/**
 * Conversation state (immutable via getters)
 */
class ConversationState {
  private messages: Message[] = [];
  private turnCount = 0;
  private toolCallHistory: ToolCallRecord[] = [];

  addMessage(message: Message): void {
    this.messages.push(message);
    if (message.role === "user") {
      this.turnCount++;
    }
  }

  recordToolCall(record: ToolCallRecord): void {
    this.toolCallHistory.push(record);
  }

  getSnapshot(): ConversationStateSnapshot {
    return {
      messages: [...this.messages],
      turnCount: this.turnCount,
      toolCallHistory: [...this.toolCallHistory],
    };
  }

  restore(snapshot: ConversationStateSnapshot): void {
    this.messages = [...snapshot.messages];
    this.turnCount = snapshot.turnCount;
    this.toolCallHistory = [...snapshot.toolCallHistory];
  }
}

/**
 * Execution state
 */
class ExecutionState {
  private isExecuting = false;
  private currentIteration = 0;
  private maxIterations: number;
  private startTime = 0;
  private lastActivityTime = 0;

  constructor(maxIterations = 25) {
    this.maxIterations = maxIterations;
  }

  start(): void {
    this.isExecuting = true;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  stop(): void {
    this.isExecuting = false;
  }

  incrementIteration(): void {
    this.currentIteration++;
    this.lastActivityTime = Date.now();
  }

  updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  getSnapshot(): ExecutionStateSnapshot {
    return {
      isExecuting: this.isExecuting,
      currentIteration: this.currentIteration,
      maxIterations: this.maxIterations,
      startTime: this.startTime,
      lastActivityTime: this.lastActivityTime,
    };
  }

  restore(snapshot: ExecutionStateSnapshot): void {
    this.isExecuting = snapshot.isExecuting;
    this.currentIteration = snapshot.currentIteration;
    this.maxIterations = snapshot.maxIterations;
    this.startTime = snapshot.startTime;
    this.lastActivityTime = snapshot.lastActivityTime;
  }
}

/**
 * Workspace state
 */
class WorkspaceState {
  private readonly root: string;
  private currentFile?: string;
  private selection?: ExecutionContext["selection"];
  private openFiles: string[] = [];
  private modifiedFiles = new Set<string>();

  constructor(root: string, context: ExecutionContext) {
    this.root = root;
    this.currentFile = context.currentFile;
    this.selection = context.selection;
    this.openFiles = [...context.openFiles];
  }

  markFileModified(filePath: string): void {
    this.modifiedFiles.add(filePath);
  }

  getSnapshot(): WorkspaceStateSnapshot {
    return {
      root: this.root,
      currentFile: this.currentFile,
      selection: this.selection,
      openFiles: [...this.openFiles],
      modifiedFiles: new Set(this.modifiedFiles),
    };
  }

  restore(snapshot: WorkspaceStateSnapshot): void {
    this.currentFile = snapshot.currentFile;
    this.selection = snapshot.selection;
    this.openFiles = [...snapshot.openFiles];
    this.modifiedFiles = new Set(snapshot.modifiedFiles);
  }
}

/**
 * Memory state
 */
class MemoryState {
  private shortTerm = new Map<string, unknown>();
  private conversationContext: string[] = [];
  private lastCheckpointId?: string;
  private taskProfile?: ThinkingRunProfile;
  private evidencePack?: EvidencePack;
  private observationSummaries: ObservationSummary[] = [];
  private validationResult?: ResponseValidationResult;
  private executionGraph?: ExecutionGraphSnapshot;

  set(key: string, value: unknown): void {
    this.shortTerm.set(key, value);
  }

  get(key: string): unknown {
    return this.shortTerm.get(key);
  }

  addContext(context: string): void {
    this.conversationContext.push(context);
  }

  setCheckpoint(checkpointId: string): void {
    this.lastCheckpointId = checkpointId;
  }

  setTaskProfile(profile: ThinkingRunProfile): void {
    this.taskProfile = profile;
  }

  setEvidencePack(evidence: EvidencePack): void {
    this.evidencePack = evidence;
  }

  addObservationSummary(summary: ObservationSummary): void {
    this.observationSummaries.push(summary);
  }

  setValidationResult(validation: ResponseValidationResult): void {
    this.validationResult = validation;
  }

  setExecutionGraph(graph: ExecutionGraphSnapshot): void {
    this.executionGraph = graph;
  }

  getSnapshot(): MemorySnapshot {
    return {
      shortTerm: new Map(this.shortTerm),
      conversationContext: [...this.conversationContext],
      lastCheckpointId: this.lastCheckpointId,
      thinking: {
        taskProfile: this.taskProfile,
        evidencePack: this.evidencePack,
        observationSummaries: [...this.observationSummaries],
        validationResult: this.validationResult,
        executionGraph: this.executionGraph,
      },
    };
  }

  restore(snapshot: MemorySnapshot): void {
    this.shortTerm = new Map(snapshot.shortTerm);
    this.conversationContext = [...snapshot.conversationContext];
    this.lastCheckpointId = snapshot.lastCheckpointId;
    this.taskProfile = snapshot.thinking?.taskProfile;
    this.evidencePack = snapshot.thinking?.evidencePack;
    this.observationSummaries = [...(snapshot.thinking?.observationSummaries ?? [])];
    this.validationResult = snapshot.thinking?.validationResult;
    this.executionGraph = snapshot.thinking?.executionGraph;
  }
}

/**
 * Runtime state - aggregates 4 sub-states
 */
export class RuntimeState {
  private readonly conversation: ConversationState;
  private readonly execution: ExecutionState;
  private readonly workspace: WorkspaceState;
  private readonly memory: MemoryState;
  private readonly correlationId: string;
  private readonly context: ExecutionContext;

  constructor(context: ExecutionContext, maxIterations = 25) {
    this.context = {
      ...context,
      openFiles: [...context.openFiles],
      selection: context.selection
        ? {
            start: { ...context.selection.start },
            end: { ...context.selection.end },
            text: context.selection.text,
          }
        : undefined,
    };
    this.conversation = new ConversationState();
    this.execution = new ExecutionState(maxIterations);
    this.workspace = new WorkspaceState(context.workspaceRoot, context);
    this.memory = new MemoryState();
    this.correlationId = `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  // === Getters (immutable snapshots) ===

  getConversation(): Readonly<ConversationStateSnapshot> {
    return this.conversation.getSnapshot();
  }

  getExecution(): Readonly<ExecutionStateSnapshot> {
    return this.execution.getSnapshot();
  }

  getWorkspace(): Readonly<WorkspaceStateSnapshot> {
    return this.workspace.getSnapshot();
  }

  getMemory(): Readonly<MemorySnapshot> {
    return this.memory.getSnapshot();
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  getContext(): ExecutionContext {
    return {
      ...this.context,
      openFiles: [...this.context.openFiles],
      selection: this.context.selection
        ? {
            start: { ...this.context.selection.start },
            end: { ...this.context.selection.end },
            text: this.context.selection.text,
          }
        : undefined,
    };
  }

  // === Mutations (controlled) ===

  addMessage(message: Message): void {
    this.conversation.addMessage(message);
    this.execution.updateActivity();
  }

  recordToolCall(
    toolName: string,
    input: unknown,
    result: unknown,
    duration: number,
    success: boolean,
  ): void {
    const record: ToolCallRecord = {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      toolName,
      input,
      result,
      timestamp: Date.now(),
      duration,
      success,
    };
    this.conversation.recordToolCall(record);
    this.execution.updateActivity();
  }

  startExecution(): void {
    this.execution.start();
  }

  stopExecution(): void {
    this.execution.stop();
  }

  incrementIteration(): void {
    this.execution.incrementIteration();
  }

  markFileModified(filePath: string): void {
    this.workspace.markFileModified(filePath);
  }

  setCheckpoint(checkpointId: string): void {
    this.memory.setCheckpoint(checkpointId);
  }

  setThinkingTaskProfile(profile: ThinkingRunProfile): void {
    this.memory.setTaskProfile(profile);
  }

  setThinkingEvidencePack(evidence: EvidencePack): void {
    this.memory.setEvidencePack(evidence);
  }

  addObservationSummary(summary: ObservationSummary): void {
    this.memory.addObservationSummary(summary);
  }

  setResponseValidation(validation: ResponseValidationResult): void {
    this.memory.setValidationResult(validation);
  }

  setExecutionGraph(graph: ExecutionGraphSnapshot): void {
    this.memory.setExecutionGraph(graph);
  }

  // === Snapshot/Restore ===

  createSnapshot(): RuntimeStateSnapshot {
    return {
      conversation: this.conversation.getSnapshot(),
      execution: this.execution.getSnapshot(),
      workspace: this.workspace.getSnapshot(),
      memory: this.memory.getSnapshot(),
      correlationId: this.correlationId,
    };
  }

  restoreSnapshot(snapshot: RuntimeStateSnapshot): void {
    this.conversation.restore(snapshot.conversation);
    this.execution.restore(snapshot.execution);
    this.workspace.restore(snapshot.workspace);
    this.memory.restore(snapshot.memory);
  }
}
