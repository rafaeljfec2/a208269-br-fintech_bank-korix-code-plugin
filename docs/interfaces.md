# Korix Code — Interface Reference

All public TypeScript interfaces, types, and classes exposed across the extension's modules.

---

## Table of Contents

- [Core Types](#core-types) (`src/core/types.ts`)
- [Context Engine Types](#context-engine-types) (`src/context/types.ts`)
- [Provider Abstraction](#provider-abstraction) (`src/providers/types.ts`)
- [Terminal System](#terminal-system) (`src/terminal/types.ts`)
- [Harness — Tool Registry](#harness--tool-registry) (`src/harness/toolRegistry.ts`)
- [Harness — Permissions](#harness--permissions) (`src/harness/permissions.ts`)
- [Harness — Execution Policy](#harness--execution-policy) (`src/harness/executionPolicy.ts`)
- [Agent Runtime](#agent-runtime) (`src/core/runtime/`)

---

## Core Types

**File:** `src/core/types.ts`

### `Mode`

```ts
type Mode = "ask" | "plan" | "agent";
```

Represents the three operational modes of the extension.

---

### `Message`

```ts
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

A single entry in a conversation session.

---

### `ToolCall`

```ts
interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}
```

Describes a tool invocation requested by the LLM.

---

### `ToolResult`

```ts
interface ToolResult {
  id: string;
  output: unknown;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
  };
}
```

The outcome of executing a `ToolCall`.

---

### `ExecutionContext`

```ts
interface ExecutionContext {
  mode: Mode;
  workspaceRoot: string;
  currentFile?: string;
  selection?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    text: string;
  };
  openFiles: string[];
}
```

Snapshot of the VSCode editor state used to ground the agent's execution.

---

### `Session`

```ts
interface Session {
  id: string;
  mode: Mode;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
```

A named conversation containing a message history.

---

### `RuntimeState`

```ts
interface RuntimeState {
  session: Session;
  context: ExecutionContext;
  isExecuting: boolean;
  currentIteration: number;
  maxIterations: number;
  checkpoints: Checkpoint[];
}
```

Full state of the agent loop at any point in time.

---

### `Checkpoint`

```ts
interface Checkpoint {
  id: string;
  timestamp: number;
  state: Partial<RuntimeState>;
  filesModified: string[];
}
```

A saved snapshot for rollback after destructive tool calls.

---

### `Config`

```ts
interface Config {
  provider: "anthropic" | "openai" | "ollama" | "openrouter";
  apiKey: string;
  model: string;
  maxIterations: number;
  contextTokenBudget: number;
  approvalFlowEnabled: boolean;
  telemetryEnabled: boolean;
}
```

Extension-level configuration, mapped from VSCode settings under the `korix.*` namespace.

---

### `LogEntry`

```ts
interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

Structured log record emitted by the telemetry logger.

---

### `Metric`

```ts
interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}
```

A single performance measurement with optional dimensional tags.

---

## Context Engine Types

**File:** `src/context/types.ts`

### `FileInfo`

```ts
interface FileInfo {
  path: string;
  content?: string;
  size: number;
  lastModified: number;
  language?: string;
}
```

Metadata for a file tracked by the workspace indexer.

---

### `SymbolInfo`

```ts
interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  containerName?: string;
}
```

A code symbol (function, class, variable) with its source location.

---

### `ImportInfo`

```ts
interface ImportInfo {
  source: string;
  target: string;
  isExternal: boolean;
}
```

An import edge in the workspace dependency graph.

---

### `WorkspaceIndex`

```ts
interface WorkspaceIndex {
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  imports: ImportInfo[];
  lastIndexed: number;
}
```

Full in-memory index produced by `WorkspaceIndexer`.

---

### `RankingScore`

```ts
interface RankingScore {
  file: string;
  score: number;
  reasons: string[];
}
```

Relevance score assigned to a file by the heuristic ranker, including a human-readable explanation of scoring factors.

---

### `ContextItem`

```ts
interface ContextItem {
  file: string;
  content: string;
  priority: number;
  tokenCount: number;
}
```

A single file included in the assembled context window.

---

### `ContextWindow`

```ts
interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
}
```

The final set of context items sent to the LLM, bounded by the token budget.

---

### `HeuristicWeights`

```ts
interface HeuristicWeights {
  currentFile: number;
  userSelection: number;
  directImports: number;
  gitDiff: number;
  openTabs: number;
  relatedSymbols: number;
  recentlyModified: number;
}
```

Configurable weights used by `HeuristicRanker` to score file relevance. Higher values increase a signal's influence on ranking.

---

## Provider Abstraction

**File:** `src/providers/types.ts`

### `ProviderType`

```ts
type ProviderType = "anthropic" | "openai" | "ollama" | "openrouter";
```

Identifies a supported LLM backend.

---

### `ProviderConfig`

```ts
interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}
```

Connection and inference parameters for a specific provider instance.

---

### `ToolDefinition`

```ts
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

JSON Schema description of a tool passed to the LLM in the provider request.

---

### `ProviderInput`

```ts
interface ProviderInput {
  messages: Message[];
  tools?: ToolDefinition[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}
```

Complete input payload sent to `AIProvider.send()`.

---

### `StreamChunk`

```ts
type StreamChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "error"; error: string; code?: string }
  | { type: "done"; stopReason?: string; usage?: TokenUsage };
```

Discriminated union of events yielded by the streaming response generator.

---

### `TokenUsage`

```ts
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
```

Token accounting returned in the `done` chunk and `StreamMetadata`.

---

### `StreamMetadata`

```ts
interface StreamMetadata {
  requestId?: string;
  model: string;
  stopReason?: string;
  usage?: TokenUsage;
}
```

Return value of `AIProvider.send()` after the stream is exhausted.

---

### `AIProvider`

```ts
interface AIProvider {
  readonly type: ProviderType;
  readonly config: ProviderConfig;

  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;
  dispose(): Promise<void>;
}
```

The core contract every LLM backend must implement. `send` returns an async generator that yields `StreamChunk` events and resolves to `StreamMetadata`.

---

### `ProviderFactory`

```ts
interface ProviderFactory {
  create(config: ProviderConfig): AIProvider;
  supports(type: ProviderType): boolean;
}
```

Factory responsible for instantiating `AIProvider` implementations.

---

### `ProviderError`

```ts
class ProviderError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public cause?: Error,
  );
}
```

Thrown by provider implementations on API errors. `statusCode` carries the HTTP status when available.

---

## Terminal System

**File:** `src/terminal/types.ts`

### `TerminalOptions`

```ts
interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
  timeout?: number;
}
```

Spawn options for a terminal session or command run.

---

### `CommandResult`

```ts
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  duration: number;
}
```

Output of a completed shell command.

---

### `TerminalSession`

```ts
interface TerminalSession {
  id: string;
  cwd: string;
  env: Record<string, string>;
  createdAt: number;
  lastUsed: number;
}
```

A persistent pseudo-terminal session managed by the session pool.

---

### `CommandExecution`

```ts
interface CommandExecution {
  command: string;
  sessionId: string;
  startTime: number;
  timeout: number;
}
```

Describes a command that is currently executing or queued.

---

### `CommandDenylistPattern`

```ts
type CommandDenylistPattern = string | RegExp;
```

A string literal or regular expression used to block dangerous commands.

---

### `SecurityConfig`

```ts
interface SecurityConfig {
  denylist: CommandDenylistPattern[];
  requiresApproval: CommandDenylistPattern[];
  maxTimeout: number;
  defaultTimeout: number;
}
```

Runtime security constraints applied by the terminal system.

---

## Harness — Tool Registry

**File:** `src/harness/toolRegistry.ts`

### `ToolContext`

```ts
interface ToolContext {
  execution: ExecutionContext;
  workspaceRoot: string;
  userId?: string;
}
```

Ambient context passed to every tool during execution.

---

### `ToolResult<T>`

```ts
interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
    timestamp: number;
  };
}
```

Typed result returned by `Tool.execute()`. Generic parameter `T` narrows the `data` field.

---

### `Tool<TInput, TOutput>`

```ts
interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;

  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  requiresApproval?(input: TInput, context: ToolContext): boolean;
  allowedInMode?(mode: ExecutionContext["mode"]): boolean;
}
```

Contract for all tools registered in the harness.

| Member | Required | Description |
|---|---|---|
| `name` | Yes | Unique identifier used for lookup |
| `description` | Yes | Human-readable description passed to the LLM |
| `schema` | Yes | Zod schema for input validation |
| `execute` | Yes | Core implementation |
| `requiresApproval` | No | Whether this input requires user approval |
| `allowedInMode` | No | Mode-level access control |

---

### `ToolRegistry`

```ts
class ToolRegistry {
  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void;
  unregister(name: string): boolean;
  get(name: string): Tool | undefined;
  has(name: string): boolean;
  list(): Tool[];
  listForMode(mode: ExecutionContext["mode"]): Tool[];
  execute<TOutput>(name: string, input: unknown, context: ToolContext): Promise<ToolResult<TOutput>>;
  toProviderDefinitions(mode?: ExecutionContext["mode"]): ToolDefinition[];
}
```

Central registry that validates inputs, enforces mode restrictions, and dispatches tool calls.

> **Singleton:** `globalToolRegistry` is exported as the default instance.

---

## Harness — Permissions

**File:** `src/harness/permissions.ts`

### `PermissionLevel`

```ts
type PermissionLevel = "always" | "once" | "never" | "ask";
```

Controls how the permission manager responds to approval requests.

---

### `PermissionRule`

```ts
interface PermissionRule {
  tool: string;
  level: PermissionLevel;
  pattern?: string;
  expiresAt?: number;
}
```

A persisted or session-scoped permission decision for a named tool.

---

### `ApprovalRequest`

```ts
interface ApprovalRequest {
  tool: string;
  input: unknown;
  description: string;
  riskLevel: "low" | "medium" | "high";
}
```

Describes a pending action that needs user approval.

---

### `ApprovalResponse`

```ts
interface ApprovalResponse {
  approved: boolean;
  remember?: boolean;
  level?: PermissionLevel;
}
```

The user's decision returned by `PermissionManager.checkPermission()`.

---

### `PermissionManager`

```ts
class PermissionManager {
  addRule(rule: PermissionRule): void;
  getRule(tool: string): PermissionRule | undefined;
  removeRule(tool: string): boolean;
  clearExpiredRules(): void;
  isBlocked(tool: string, input?: unknown): boolean;
  checkPermission(request: ApprovalRequest): Promise<ApprovalResponse>;
  requestApproval(tool: string, input: unknown, description: string, riskLevel?: "low" | "medium" | "high"): Promise<boolean>;
  exportRules(): PermissionRule[];
  importRules(rules: PermissionRule[]): void;
  reset(): void;
}
```

Manages an allowlist/denylist of permission rules and surfaces a VSCode modal when user approval is required. Includes a hardcoded denylist for dangerous shell patterns (e.g. `rm -rf`, `sudo`, fork bomb).

> **Singleton:** `globalPermissionManager` is exported as the default instance.

---

## Harness — Execution Policy

**File:** `src/harness/executionPolicy.ts`

### `ActionType`

```ts
type ActionType = "read" | "write" | "delete" | "execute" | "network";
```

Category of a tool's side effect.

---

### `RiskLevel`

```ts
type RiskLevel = "low" | "medium" | "high" | "critical";
```

Severity classification used to decide approval requirements.

---

### `ExecutionPolicy`

```ts
interface ExecutionPolicy {
  action: ActionType;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  canRunInReadOnlyMode: boolean;
}
```

Governs whether a tool needs approval and whether it is permitted in ASK mode.

---

### `defaultPolicies`

Pre-configured policies for built-in tools:

| Tool | Action | Risk | Approval | Read-Only Safe |
|---|---|---|---|---|
| `ReadFile` | read | low | No | Yes |
| `WriteFile` | write | medium | Yes | No |
| `DeleteFile` | delete | high | Yes | No |
| `RunCommand` | execute | high | Yes | No |
| `NetworkRequest` | network | medium | Yes | Yes |

Unknown tools fall back to `execute / medium / requiresApproval: true / canRunInReadOnlyMode: false`.

---

### `getPolicyForTool`

```ts
function getPolicyForTool(toolName: string): ExecutionPolicy;
```

Returns the `ExecutionPolicy` for a named tool, using the fallback policy for unregistered names.

---

## Agent Runtime

**Files:** `src/core/runtime/`

### `AgentLoopOptions`

```ts
interface AgentLoopOptions {
  executionEngine: ExecutionEngine;
  stateManager: RuntimeStateManager;
  checkpointManager?: CheckpointManager;
  taskQueue?: TaskQueue;
  maxIterations?: number;
}
```

Constructor options for `AgentLoop`.

---

### `AgentLoopResult`

```ts
interface AgentLoopResult {
  success: boolean;
  iterations: number;
  messages: Message[];
  error?: string;
}
```

Final return value of `AgentLoop.run()`.

---

### `AgentLoop`

```ts
class AgentLoop {
  constructor(options: AgentLoopOptions);

  run(initialMessage: string): AsyncGenerator<
    StreamChunk | { type: "iteration"; iteration: number },
    AgentLoopResult
  >;

  cancel(): void;
  getState(): RuntimeState;
  getCheckpoints(): Checkpoint[];
  rollback(checkpointId: string): Promise<boolean>;
}
```

Drives the iterative agent loop. Yields `StreamChunk` events and `{ type: "iteration" }` markers. Saves a `Checkpoint` after each iteration that contains tool calls. `cancel()` aborts via `AbortController`.

---

### `RuntimeStateEvents`

```ts
interface RuntimeStateEvents {
  stateChanged: (state: RuntimeState) => void;
  iterationComplete: (iteration: number) => void;
  executionStarted: () => void;
  executionCompleted: () => void;
  executionFailed: (error: Error) => void;
}
```

Events emitted by `RuntimeStateManager` (extends `EventEmitter`).

---

### `RuntimeStateManager`

```ts
class RuntimeStateManager extends EventEmitter<RuntimeStateEvents> {
  constructor(initialContext: ExecutionContext);

  getState(): Readonly<RuntimeState>;
  setState(updates: Partial<RuntimeState>): void;
  addMessage(message: Message): void;
  getMessages(): readonly Message[];
  clearMessages(): void;
  startExecution(): void;
  stopExecution(): void;
  incrementIteration(): void;
  getCurrentIteration(): number;
  getMaxIterations(): number;
  setMaxIterations(max: number): void;
  isExecuting(): boolean;
  hasReachedMaxIterations(): boolean;
  getContext(): ExecutionContext;
  updateContext(updates: Partial<ExecutionContext>): void;
  reset(): void;
}
```

Single source of truth for agent loop state. All mutations emit `stateChanged`.

---

### `Task`

```ts
interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  error?: string;
}
```

A unit of work managed by `TaskQueue`.

---

### `TaskQueue`

```ts
class TaskQueue {
  add(description: string): Task;
  start(taskId: string): void;
  complete(taskId: string): void;
  fail(taskId: string, error: string): void;
  getAll(): readonly Task[];
  getPending(): readonly Task[];
  clear(): void;
}
```

FIFO queue of subtasks, used by PLAN mode decomposer and the agent executor to track progress.
