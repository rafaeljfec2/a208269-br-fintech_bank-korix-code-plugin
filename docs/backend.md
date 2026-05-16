# Korix Code — Backend Architecture

Korix Code is a VSCode extension that runs an AI-native agentic coding runtime entirely inside the Extension Host. There is no separate process or Electron shell; all backend logic executes as TypeScript compiled to ES2022 via esbuild.

---

## Table of Contents

1. [Extension Entry Point](#extension-entry-point)
2. [Core Types](#core-types)
3. [Runtime Layer](#runtime-layer)
4. [Provider Abstraction](#provider-abstraction)
5. [Tool Harness](#tool-harness)
6. [Context Engine](#context-engine)
7. [Execution Modes](#execution-modes)
8. [Terminal System](#terminal-system)
9. [Telemetry & Logging](#telemetry--logging)
10. [Configuration](#configuration)
11. [Data Flow Summary](#data-flow-summary)

---

## Extension Entry Point

**File:** `src/extension.ts`

`activate()` is called by VSCode on startup (`onStartupFinished`). It bootstraps all subsystems in order:

1. Creates a named `OutputChannel` ("Korix Code") and initialises the logger.
2. Instantiates `ProviderConfigManager` and calls `initializeProvider()` asynchronously.
3. Initialises the **Context Engine** and kicks off workspace indexing.
4. Initialises the **Terminal System** (`TerminalSessionManager`, `CommandRunner`).
5. Calls `registerAllTools()` to populate the global tool registry.
6. Registers `KorixSidebarProvider` (WebviewView) and `TimelineProvider` (TreeView).
7. Registers VSCode commands (`korix.ask`, `korix.plan`, `korix.agent`, `korix.cancelExecution`, etc.).
8. Creates a status-bar item that reflects the active mode.

`deactivate()` disposes the provider, registry, context engine, session manager, output channel, and status-bar item.

---

## Core Types

**File:** `src/core/types.ts`

| Type | Purpose |
|---|---|
| `Mode` | `"ask" \| "plan" \| "agent"` — active execution mode |
| `Message` | Single conversation turn: `role`, `content`, `timestamp`, optional `metadata` |
| `ToolCall` | LLM-requested tool invocation: `id`, `name`, `input` |
| `ToolResult` | Result of executing a tool, including `duration` and `approved` flag |
| `ExecutionContext` | Runtime snapshot: mode, workspace root, current file, selection, open files |
| `Session` | A conversation session with an ordered `Message[]` array |
| `RuntimeState` | Live snapshot of a running session: `session`, `context`, `isExecuting`, iteration counters, and `checkpoints` |
| `Checkpoint` | Point-in-time snapshot of `RuntimeState` plus a list of modified files |
| `Config` | User-facing configuration: provider, model, token budget, approval-flow toggle |
| `LogEntry` / `Metric` | Telemetry primitives |

---

## Runtime Layer

**Directory:** `src/core/runtime/`

### AgentLoop (`agentLoop.ts`)

The main loop that drives iterative agent execution. It is an `AsyncGenerator` so callers can stream events in real time.

```
AgentLoop.run(initialMessage)
  │
  ├─ stateManager.startExecution()
  ├─ loop while !maxIterations && isExecuting
  │     ├─ stateManager.incrementIteration()
  │     ├─ executionEngine.execute(messages)  ← yields StreamChunks
  │     ├─ if tool calls occurred → checkpointManager.save()
  │     └─ if no tool calls → break (task complete)
  └─ return AgentLoopResult { success, iterations, messages }
```

Key behaviours:
- **Abort:** `cancel()` sets an `AbortController` signal and calls `stateManager.stopExecution()`.
- **Rollback:** `rollback(checkpointId)` restores a previous `RuntimeState` from `CheckpointManager`.
- **Max iterations:** Configurable guard (default from `Config.maxIterations`) prevents infinite loops.

### ExecutionEngine (`executionEngine.ts`)

Bridges the AI provider and the tool registry within a single iteration.

```
ExecutionEngine.execute(messages)
  │
  ├─ toolRegistry.toProviderDefinitions(mode) → ToolDefinition[]
  ├─ provider.send({ messages, tools }) → AsyncGenerator<StreamChunk>
  ├─ for each StreamChunk:
  │     ├─ yield chunk to AgentLoop
  │     └─ if chunk.type === "tool_use":
  │           ├─ getPolicyForTool(name) → ExecutionPolicy
  │           ├─ if requiresApproval → permissionManager.requestApproval()
  │           └─ toolRegistry.execute(name, input, context)
  └─ return ExecutionResult
```

### RuntimeStateManager (`runtimeState.ts`)

Manages the mutable `RuntimeState`: adding messages, tracking iteration count, toggling `isExecuting`.

### CheckpointManager (`checkpoints.ts`)

Stores ordered snapshots of `RuntimeState`. Enables rollback after destructive tool calls.

### TaskQueue (`taskQueue.ts`)

Queue abstraction for scheduling agent tasks; consumed by the agent executor.

---

## Provider Abstraction

**Directory:** `src/providers/`

### Interface (`types.ts`)

```typescript
interface AIProvider {
  readonly type: ProviderType;
  readonly config: ProviderConfig;
  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;
  dispose(): Promise<void>;
}
```

`StreamChunk` is a discriminated union:

| Variant | Fields |
|---|---|
| `text` | `content: string` |
| `thinking` | `content: string` |
| `tool_use` | `id`, `name`, `input` |
| `error` | `error`, optional `code` |
| `done` | `stopReason`, optional `usage` |

### AnthropicProvider (`anthropic.ts`)

Wraps `@anthropic-ai/sdk`. Uses `messages.create({ stream: true })` for text streaming. When tools are provided, it issues a second non-streaming request to collect complete `tool_use` blocks (noted as a future optimisation target).

### ProviderRegistry (`registry.ts`) & ProviderConfigManager (`config.ts`)

- `ProviderRegistry` (singleton `globalRegistry`) maps `ProviderType` → `ProviderFactory` and creates/disposes providers.
- `ProviderConfigManager` reads VSCode settings and the secret storage API to resolve API keys, offering `ensureApiKey()` for on-demand prompting.

Supported provider types: `anthropic`, `openai`, `ollama`, `openrouter`.

---

## Tool Harness

**Directory:** `src/harness/`

### ToolRegistry (`toolRegistry.ts`)

Central registry keyed by tool name. Each `Tool<TInput, TOutput>` carries:

- `name` and `description` (surfaced to the LLM).
- `schema: z.ZodSchema<TInput>` — input is validated before execution.
- `execute(input, context): Promise<ToolResult<TOutput>>`
- Optional `requiresApproval(input, context)` and `allowedInMode(mode)` hooks.

`toProviderDefinitions(mode?)` converts registered tools to the `ToolDefinition[]` format expected by the provider SDK, filtering by mode.

Global singleton: `globalToolRegistry`.

### PermissionManager (`permissions.ts`)

Implements a per-tool allowlist/denylist with four permission levels:

| Level | Behaviour |
|---|---|
| `always` | Auto-approve without prompting |
| `once` | Approve then remove the rule |
| `never` | Block silently |
| `ask` | Fall through to VSCode modal dialog |

The modal shows risk level (`low ✅ / medium ⚠️ / high 🔴`), description, and four choices: *Approve Once*, *Always Allow*, *Reject*, *Never Allow*.

Default denylist blocks: `rm -rf`, `sudo`, `curl | bash`, `wget | sh`, fork bomb, `dd if=/dev/zero`, `mkfs`, `fdisk`.

Global singleton: `globalPermissionManager`.

### ExecutionPolicy (`executionPolicy.ts`)

Static map of tool name → `ExecutionPolicy`:

| Tool | Action | Risk | Requires Approval | Read-Only Safe |
|---|---|---|---|---|
| `ReadFile` | read | low | no | yes |
| `WriteFile` | write | medium | yes | no |
| `DeleteFile` | delete | high | yes | no |
| `RunCommand` | execute | high | yes | no |
| `NetworkRequest` | network | medium | yes | yes |

Unknown tools default to `execute / medium / requiresApproval: true`.

### Sandbox (`sandbox.ts`)

Sandbox abstraction (file present, implementation details not fully elaborated in source). Intended as an additional isolation layer for tool execution.

### Registered Tools (`src/tools/`)

| File | Tool | Description |
|---|---|---|
| `filesystem.ts` | `ReadFileTool` | Read file contents from workspace |
| `terminal.ts` | `RunCommandTool` | Execute shell commands via PTY |
| `workspace.ts` | workspace tools | (declared, registration pending) |
| `index.ts` | — | Calls `registerAllTools()`, currently registers `ReadFileTool` and `RunCommandTool` |

---

## Context Engine

**Directory:** `src/context/`

The Context Engine selects which files and symbols to include in the provider prompt, respecting a configurable token budget (`Config.contextTokenBudget`, default 180 000 tokens).

### Components

```
ContextEngine
  ├─ WorkspaceIndexer   (indexing/workspaceIndexer.ts)
  ├─ HeuristicRanker    (ranking/heuristicRanker.ts)
  └─ ContextBuilder     (retrieval/contextBuilder.ts)
```

**WorkspaceIndexer** maintains a `WorkspaceIndex`:
- `files: Map<string, FileInfo>` — path, size, last-modified, language.
- `symbols: Map<string, SymbolInfo[]>` — name, kind, location.
- `imports: ImportInfo[]` — source → target edges, flagged as external or internal.

**HeuristicRanker** scores files using `HeuristicWeights`:

| Signal | Weight field |
|---|---|
| Currently open file | `currentFile` |
| User text selection | `userSelection` |
| Direct imports | `directImports` |
| Git diff | `gitDiff` |
| Open editor tabs | `openTabs` |
| Related symbols | `relatedSymbols` |
| Recently modified | `recentlyModified` |

Produces `RankingScore[]` sorted by descending score.

**ContextBuilder** converts ranked files into a `ContextWindow`:
- `items: ContextItem[]` — file path, content, priority, token count.
- `totalTokens` — sum of all included items.
- `budget` — the configured token ceiling.

**TokenBudget** (`tokenBudget.ts`) — utility for token counting and budget enforcement.

Global lifecycle:

```typescript
initializeContextEngine()  // creates singleton
getContextEngine()         // retrieves singleton, throws if not initialised
contextEngine.dispose()    // calls indexer.dispose()
```

---

## Execution Modes

**Directory:** `src/modes/`

### ModeManager (`modeManager.ts`)

Extends `EventEmitter`. Exposes `setMode(mode)` which emits `"modeChanged"`. Each mode has a `ModeConfig`:

| Mode | allowTools | allowExecution | allowSideEffects |
|---|---|---|---|
| `ask` | true | false | false |
| `plan` | true | false | false |
| `agent` | true | true | true |

Helper predicates: `canExecuteTools()`, `canExecuteCommands()`, `canHaveSideEffects()`, `isReadOnly()`.

### ASK Mode (`modes/ask/handler.ts`)

Read-only chat handler. Queries the provider with context but passes no write/execute tools.

### PLAN Mode (`modes/plan/decomposer.ts`)

Decomposes user requests into structured task plans. No side effects; output is a plan document.

### AGENT Mode (`modes/agent/executor.ts`)

Full execution mode. Creates an `AgentLoop` backed by `ExecutionEngine`, with all registered tools available.

---

## Terminal System

**Directory:** `src/terminal/`

### TerminalSessionManager (`session.ts`)

Manages a pool of named PTY sessions (`Map<sessionId, { session, pty }>`):

- `createSession(options)` — spawns a `PTYManager`, assigns a unique `session-N-<timestamp>` ID.
- `killSession(id)` — terminates the PTY and removes the entry.
- `cleanupIdleSessions(maxIdleTime)` — evicts sessions idle longer than the threshold (default 30 min).
- `dispose()` — kills all sessions.

Global singleton: `globalSessionManager`.

### PTYManager (`pty.ts`)

Wraps `node-pty`. Handles spawn, I/O, and process termination for a single shell session.

### CommandRunner (`commandRunner.ts`)

Higher-level API over `TerminalSessionManager`. Used by `RunCommandTool` to execute shell commands and capture output.

### Types (`types.ts`)

```typescript
interface TerminalSession {
  id: string;
  cwd: string;
  env: Record<string, string>;
  createdAt: number;
  lastUsed: number;
}

interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
}
```

---

## Telemetry & Logging

**File:** `src/telemetry/logger.ts`

`Logger` wraps [pino](https://getpino.io). In non-production environments it can load `pino-pretty` for coloured, timestamped output.

- Standard levels: `debug`, `info`, `warn`, `error`.
- `error()` enriches metadata with `{ message, stack, name }` from the `Error` object.
- When a VSCode `OutputChannel` is provided, every log line is also appended there with ISO timestamp and padded level prefix.
- `child(bindings)` returns a child logger with extra bound fields.

Global lifecycle:

```typescript
initializeLogger(options)  // creates singleton, called in activate()
getLogger()                // retrieves singleton, throws if not initialised
```

---

## Configuration

VSCode settings namespace: `korix.*`

| Setting | Type | Default | Description |
|---|---|---|---|
| `korix.provider` | string | `"anthropic"` | Active LLM provider |
| `korix.anthropic.model` | string | `"claude-sonnet-4-6"` | Model identifier |
| `korix.maxIterations` | number | `25` | Agent loop iteration cap |
| `korix.contextTokenBudget` | number | `180000` | Context window token budget |
| `korix.approvalFlow.enabled` | boolean | `true` | Show permission modals |

API keys are stored in VSCode's `SecretStorage` (not in `settings.json`).

---

## Data Flow Summary

```
User command (korix.agent)
  │
  ▼
extension.ts → handleModeSwitch("agent")
  │
  ▼
AgentLoop.run(userMessage)
  │
  ├─ RuntimeStateManager  ← tracks messages, iteration count
  │
  ├─ ContextEngine.buildContext()  ← ranks workspace files, fills token budget
  │         WorkspaceIndexer → HeuristicRanker → ContextBuilder → ContextWindow
  │
  ├─ ExecutionEngine.execute(messages)
  │         │
  │         ├─ ToolRegistry.toProviderDefinitions("agent")
  │         │
  │         ├─ AIProvider.send({ messages, tools })  ← streams StreamChunk[]
  │         │         AnthropicProvider → @anthropic-ai/sdk
  │         │
  │         └─ for each tool_use chunk:
  │               ├─ ExecutionPolicy.getPolicyForTool()
  │               ├─ PermissionManager.requestApproval()  ← VSCode modal
  │               └─ ToolRegistry.execute()
  │                     ReadFileTool / RunCommandTool → PTYManager
  │
  ├─ CheckpointManager.save()  ← after each tool-call iteration
  │
  └─ AgentLoopResult { success, iterations, messages }
```
