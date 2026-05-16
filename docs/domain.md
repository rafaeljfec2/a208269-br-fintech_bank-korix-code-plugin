# Korix Code — Domain Model

Korix Code is a VSCode extension that embeds an AI-native agentic runtime directly in the Extension Host. It exposes three interaction modes, routes requests through a layered security harness, and orchestrates one or more LLM providers via a uniform streaming interface.

---

## Table of Contents

1. [Core Entities](#core-entities)
2. [Modes](#modes)
3. [Agent Runtime](#agent-runtime)
4. [Context Engine](#context-engine)
5. [Provider Abstraction](#provider-abstraction)
6. [Tool Harness & Security](#tool-harness--security)
7. [Terminal System](#terminal-system)
8. [UI Layer](#ui-layer)
9. [Telemetry](#telemetry)
10. [Configuration](#configuration)
11. [Layered Architecture](#layered-architecture)

---

## Core Entities

Defined in `src/core/types.ts`.

### Mode

```ts
type Mode = "ask" | "plan" | "agent";
```

The single discriminant that controls what the runtime is permitted to do in a given session.

### Message

```ts
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

All conversation turns are `Message` values. Tool responses carry `role: "tool"` and are included in the same message list sent to the provider.

### ToolCall / ToolResult

```ts
interface ToolCall  { id: string; name: string; input: unknown; }
interface ToolResult {
  id: string;
  output: unknown;
  error?: string;
  metadata?: { duration: number; approved: boolean; };
}
```

A `ToolCall` is emitted by the LLM; the harness validates it, requests user approval when required, and produces a `ToolResult` that is appended back to the message list.

### ExecutionContext

```ts
interface ExecutionContext {
  mode: Mode;
  workspaceRoot: string;
  currentFile?: string;
  selection?: { start: Position; end: Position; text: string };
  openFiles: string[];
}
```

Captures the VSCode editor state at the moment a request is triggered. Feeds the context engine's ranking.

### Session

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

A session contains the full conversation history for one continuous interaction. Sessions are stored in-memory by `RuntimeStateManager` and can be snapshotted as `Checkpoint` values.

### Checkpoint

```ts
interface Checkpoint {
  id: string;
  timestamp: number;
  state: Partial<RuntimeState>;
  filesModified: string[];
}
```

Created automatically after every iteration that involves tool calls. Enables rollback via `AgentLoop.rollback(checkpointId)`.

### RuntimeState

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

The complete snapshot of agent execution at any instant.

---

## Modes

Defined in `src/modes/modeManager.ts`.

| Mode    | allowTools | allowExecution | allowSideEffects | Description |
|---------|-----------|----------------|-----------------|-------------|
| `ask`   | ✓         | ✗              | ✗               | Read-only analysis and explanations |
| `plan`  | ✓         | ✗              | ✗               | Task decomposition and planning |
| `agent` | ✓         | ✓              | ✓               | Full execution with tool access |

`ModeManager` is an `EventEmitter` that fires `modeChanged` whenever the active mode changes. Consumers query `canExecuteTools()`, `canExecuteCommands()`, and `canHaveSideEffects()` rather than comparing the mode string directly.

### Mode Implementations

| Module | Path | Responsibility |
|--------|------|----------------|
| Ask handler | `src/modes/ask/handler.ts` | Forwards prompt to provider in read-only posture |
| Plan decomposer | `src/modes/plan/decomposer.ts` | Breaks a goal into ordered sub-tasks |
| Agent executor | `src/modes/agent/executor.ts` | Drives the `AgentLoop` with full tool access |

---

## Agent Runtime

Located in `src/core/runtime/`.

### AgentLoop (`agentLoop.ts`)

The central control loop for `agent` mode. It is an `AsyncGenerator` that yields `StreamChunk` values (and `{ type: "iteration" }` markers) to the caller while iterating:

```
while (not max-iterations AND still executing):
  increment iteration counter
  call ExecutionEngine.execute(messages)          → stream chunks
  if any tool_use chunk arrived:
    save Checkpoint
  else:
    stop (model finished without further tool calls)
```

Cancellation is handled via `AbortController`; calling `AgentLoop.cancel()` sets the abort flag and stops the state manager.

### ExecutionEngine (`executionEngine.ts`)

Bridges `AgentLoop` with the active `AIProvider`. Handles streaming, appends assistant messages, dispatches tool calls through the harness, and appends tool results.

### RuntimeStateManager (`runtimeState.ts`)

Manages `RuntimeState` mutations: `startExecution()`, `stopExecution()`, `incrementIteration()`, `addMessage()`, `setMaxIterations()`, `setState()`, etc.

### CheckpointManager (`checkpoints.ts`)

Persists `RuntimeState` snapshots keyed by checkpoint ID. Exposes `save(state)`, `restore(id)`, and `getAll()`.

### TaskQueue (`taskQueue.ts`)

Optional FIFO queue for sequencing multiple user requests without blocking the VSCode UI.

---

## Context Engine

Located in `src/context/`.

The context engine selects which workspace files are included in every LLM request, subject to a token budget.

### WorkspaceIndexer (`indexing/workspaceIndexer.ts`)

Builds and maintains a `WorkspaceIndex`:

```ts
interface WorkspaceIndex {
  files:       Map<string, FileInfo>;    // path → metadata + content
  symbols:     Map<string, SymbolInfo[]>; // symbol name → declarations
  imports:     ImportInfo[];              // import graph edges
  lastIndexed: number;
}
```

### HeuristicRanker (`ranking/heuristicRanker.ts`)

Scores every indexed file and returns `RankingScore[]`. Weights are configurable via `HeuristicWeights`:

| Signal | Default weight |
|--------|---------------|
| `currentFile` | highest |
| `userSelection` | high |
| `directImports` | medium-high |
| `gitDiff` | medium |
| `openTabs` | medium |
| `relatedSymbols` | medium |
| `recentlyModified` | low |

### ContextBuilder (`retrieval/contextBuilder.ts`)

Converts ranked files into a `ContextWindow` that respects the token budget:

```ts
interface ContextWindow {
  items:       ContextItem[];  // { file, content, priority, tokenCount }
  totalTokens: number;
  budget:      number;
}
```

### TokenBudget (`tokenBudget.ts`)

Utility that tracks remaining token capacity and decides whether a candidate `ContextItem` fits.

### ContextEngine (`contextEngine.ts`)

Façade that orchestrates Indexer → Ranker → Builder into a single `buildContext(executionContext)` call consumed by `ExecutionEngine`.

---

## Provider Abstraction

Located in `src/providers/`.

### AIProvider interface

```ts
interface AIProvider {
  readonly type: ProviderType;    // "anthropic" | "openai" | "ollama" | "openrouter"
  readonly config: ProviderConfig;
  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;
  dispose(): Promise<void>;
}
```

All providers stream responses as typed `StreamChunk` values:

```ts
type StreamChunk =
  | { type: "text";      content: string }
  | { type: "thinking";  content: string }
  | { type: "tool_use";  id: string; name: string; input: unknown }
  | { type: "error";     error: string; code?: string }
  | { type: "done";      stopReason?: string; usage?: TokenUsage };
```

`TokenUsage` tracks input/output tokens plus cache read/write tokens (Anthropic prompt caching).

### ProviderRegistry (`registry.ts`)

Singleton that maps `ProviderType` → `ProviderFactory`. Switching providers at runtime requires only calling `registry.setActive(type)`.

### AnthropicProvider (`anthropic.ts`)

Default provider. Targets `claude-sonnet-4-6`. Wraps the Anthropic streaming API, mapping SDK events to the internal `StreamChunk` union.

### ProviderConfig (`config.ts`)

Loads and validates provider settings from VSCode workspace configuration, including `apiKey`, `model`, `baseUrl`, `maxTokens`, and `temperature`.

---

## Tool Harness & Security

Located in `src/harness/`.

### ToolRegistry (`toolRegistry.ts`)

Central catalogue of available tools. Each tool exposes a `ToolDefinition` (name, description, JSON Schema for input) plus an `execute(input)` method. Tools self-register via `registerAllTools()` in `src/tools/index.ts`.

Currently registered tools:

| Tool | Module | Description |
|------|--------|-------------|
| `read_file` | `src/tools/filesystem.ts` | Reads a workspace file |
| `run_command` | `src/tools/terminal.ts` | Executes a shell command via `CommandRunner` |

Additional tools (workspace, etc.) defined in `src/tools/workspace.ts` are not yet wired into `registerAllTools`.

### PermissionManager (`permissions.ts`)

Maintains an in-memory `Map<tool, PermissionRule>` and a hard-coded denylist of destructive patterns (`rm -rf`, `sudo`, `curl | bash`, fork bombs, `dd if=/dev/zero`, `mkfs`, `fdisk`).

Permission levels:

| Level | Behaviour |
|-------|-----------|
| `always` | Auto-approve every invocation |
| `once` | Approve this invocation, then delete the rule |
| `never` | Auto-reject |
| `ask` | Fall through to the VSCode modal |

The modal presents a risk emoji (`✅` / `⚠️` / `🔴`) and four choices: **Approve Once**, **Always Allow**, **Reject**, **Never Allow**.

### ExecutionPolicy (`executionPolicy.ts`)

Higher-level gate that enforces mode constraints (e.g., blocks side-effecting tool calls when mode is `ask` or `plan`) before delegating to `PermissionManager`.

### Sandbox (`sandbox.ts`)

Wraps tool execution to enforce resource limits and capture timing metadata included in `ToolResult.metadata`.

---

## Terminal System

Located in `src/terminal/`.

| Module | Responsibility |
|--------|---------------|
| `session.ts` | Manages named `TerminalSession` instances (cwd, env, timestamps) |
| `pty.ts` | Thin wrapper over `node-pty` for interactive PTY sessions |
| `commandRunner.ts` | Runs non-interactive commands with timeout enforcement, capturing stdout/stderr and exit code |
| `types.ts` | Shared types: `CommandResult`, `TerminalOptions`, `SecurityConfig` |

`SecurityConfig` carries its own `denylist` and `requiresApproval` pattern lists that the `RunCommandTool` checks before forwarding to `CommandRunner`.

```ts
interface CommandResult {
  stdout:   string;
  stderr:   string;
  exitCode: number | null;
  timedOut: boolean;
  duration: number;
}
```

---

## UI Layer

Located in `src/ui/`.

### SidebarProvider (`sidebar/sidebarProvider.ts`)

Implements `vscode.WebviewViewProvider`. Renders the main chat interface as a Webview, forwarding user input to the active mode handler and streaming responses back.

### TimelineProvider (`timeline/timelineProvider.ts`)

Displays the checkpoint / iteration history as a VSCode TreeView, allowing the user to inspect and restore past states.

---

## Telemetry

Located in `src/telemetry/logger.ts`.

`Logger` is a singleton (`getLogger()`) that emits structured `LogEntry` and `Metric` records.

```ts
type LogEntry = { level: "debug"|"info"|"warn"|"error"; message: string; timestamp: number; metadata?: Record<string, unknown>; };
type Metric   = { name: string; value: number; unit: string; timestamp: number; tags?: Record<string, string>; };
```

Telemetry can be disabled globally via `Config.telemetryEnabled`.

---

## Configuration

`Config` (read from VSCode settings under the `korix.*` namespace):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `korix.provider` | string | `"anthropic"` | Active LLM provider |
| `korix.anthropic.model` | string | `"claude-sonnet-4-6"` | Model identifier |
| `korix.maxIterations` | number | `25` | Agent loop iteration cap |
| `korix.contextTokenBudget` | number | `180000` | Max tokens for context window |
| `korix.approvalFlow.enabled` | boolean | `true` | Require user approval for tools |

---

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│                   VSCode UI                  │
│         Sidebar (Webview)  Timeline (Tree)   │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│                 Mode Layer                   │
│          ASK handler │ PLAN decomposer       │
│              AGENT executor                  │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│              Agent Runtime                   │
│   AgentLoop → ExecutionEngine                │
│   RuntimeStateManager   CheckpointManager    │
└──────────┬─────────────────┬────────────────┘
           │                 │
┌──────────▼──────┐  ┌───────▼───────────────┐
│  Context Engine │  │   Tool Harness         │
│  Indexer        │  │   ToolRegistry         │
│  HeuristicRanker│  │   PermissionManager    │
│  ContextBuilder │  │   ExecutionPolicy      │
│  TokenBudget    │  │   Sandbox              │
└─────────────────┘  └───────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼───┐  ┌───────▼───┐  ┌──────▼──────┐
    │  Filesystem │  │  Terminal  │  │  Workspace  │
    │  tools      │  │  tools     │  │  tools      │
    └─────────────┘  └─────┬─────┘  └─────────────┘
                           │
                  ┌────────▼────────┐
                  │ Terminal System  │
                  │ CommandRunner    │
                  │ PTY              │
                  │ SessionManager   │
                  └─────────────────┘
              ┌──────────────────────────────┐
              │      Provider Layer           │
              │  AnthropicProvider            │
              │  ProviderRegistry             │
              │  (OpenAI / Ollama / OpenRouter│
              │   — pluggable via factory)    │
              └──────────────────────────────┘
```

Data flows downward. The UI triggers a mode handler, which drives the agent runtime, which consults the context engine and dispatches tool calls through the harness, which reaches the terminal or filesystem tools. The provider layer is accessed exclusively by `ExecutionEngine`.
