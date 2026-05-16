# Korix Code — Architecture

**Version:** 0.1.0  
**Target:** VSCode Extension Host (Node.js, ES2022)  
**Build tool:** esbuild (single bundle → `dist/extension.js`)

---

## Overview

Korix Code is a VSCode extension that implements an **AI-native agentic coding runtime** fully inside the Extension Host process. It provides three interaction modes (Ask, Plan, Agent) backed by pluggable LLM providers, a secure tool-execution harness, an intelligent context engine, and a PTY-based terminal system.

```
User ──► VSCode Commands / Keybindings
              │
              ▼
        extension.ts  (activate / deactivate)
              │
     ┌────────┴────────┐
     │                 │
  ModeManager     ContextEngine
     │
     ├── Ask Handler
     ├── Plan Decomposer
     └── Agent Executor ──► AgentLoop
                                │
                          ExecutionEngine
                          ┌─────┴──────┐
                       Provider     ToolRegistry
                       (Anthropic…)   │
                                    Harness (Permissions, Sandbox, Policy)
                                      │
                                   Tools (filesystem, terminal, workspace)
```

---

## Layer Map

| Directory | Responsibility |
|---|---|
| `src/extension.ts` | VSCode lifecycle, command registration, subsystem wiring |
| `src/core/` | Domain types, agent loop, execution engine, runtime state, checkpoints, task queue |
| `src/providers/` | LLM provider abstraction + Anthropic implementation |
| `src/harness/` | Security layer: permissions, sandbox, execution policy, tool registry |
| `src/tools/` | Concrete tool implementations (filesystem, terminal, workspace) |
| `src/modes/` | Mode-specific logic (Ask handler, Plan decomposer, Agent executor) |
| `src/context/` | Context engine: workspace indexing, heuristic ranking, context building |
| `src/terminal/` | PTY integration, session management, command runner |
| `src/ui/` | Sidebar WebviewView, Timeline TreeDataProvider |
| `src/telemetry/` | Structured logger |

---

## Extension Entry Point

`src/extension.ts` is the VSCode `activate` function. Initialization order matters:

1. **Logger** — `initializeLogger()` wraps the VSCode OutputChannel.
2. **ProviderConfigManager** — reads VSCode settings; initiates the configured LLM provider.
3. **ContextEngine** — `initializeContextEngine()` then `contextEngine.initialize()` (async, workspace indexing).
4. **Terminal System** — `initializeSessionManager()` + `initializeCommandRunner()`.
5. **Tool Registration** — `registerAllTools()` populates the global `ToolRegistry`.
6. **UI** — registers `KorixSidebarProvider` (WebviewView) and `TimelineProvider` (TreeDataProvider).
7. **Commands** — `korix.ask`, `korix.plan`, `korix.agent`, `korix.openSidebar`, `korix.cancelExecution`, `korix.clearHistory`, `korix.testProvider`.

`deactivate()` disposes providers, the context engine, terminal sessions, the output channel, and the status bar item in reverse order.

---

## Core Types (`src/core/types.ts`)

All subsystems share these primitives:

```typescript
type Mode = "ask" | "plan" | "agent";

interface Message       { role, content, timestamp, metadata? }
interface ToolCall      { id, name, input }
interface ToolResult    { id, output, error?, metadata? }
interface ExecutionContext { mode, workspaceRoot, currentFile?, selection?, openFiles }
interface Session       { id, mode, messages[], createdAt, updatedAt }
interface RuntimeState  { session, context, isExecuting, currentIteration, maxIterations, checkpoints[] }
interface Checkpoint    { id, timestamp, state, filesModified[] }
interface Config        { provider, apiKey, model, maxIterations, contextTokenBudget, approvalFlowEnabled, telemetryEnabled }
```

---

## Modes (`src/modes/`)

### ModeManager

`ModeManager` extends `EventEmitter` and governs what capabilities are active per mode:

| Mode | Tools | Execution | Side-effects |
|---|---|---|---|
| `ask` | yes | no | no |
| `plan` | yes | no | no |
| `agent` | yes | yes | yes |

Mode switches emit `modeChanged` events. The VSCode status bar reflects the current mode.

### Ask Mode (`src/modes/ask/handler.ts`)

Read-only Q&A. Sends user query to the LLM with workspace context; returns explanations and analyses. No file mutations allowed.

### Plan Mode (`src/modes/plan/decomposer.ts`)

Decomposes high-level tasks into actionable steps. Produces structured plans with architectural impact analysis. No side-effects.

### Agent Mode (`src/modes/agent/executor.ts`)

Full execution mode. Delegates to the `AgentLoop` with tool access and side-effect capability. Supports iterative execution with checkpoints.

---

## Agent Runtime (`src/core/runtime/`)

### AgentLoop

The central loop for agentic execution. Implemented as an `AsyncGenerator` that yields `StreamChunk` or `{ type: "iteration" }` events:

```
while (iterations < max && executing) {
  stateManager.incrementIteration()
  stream = executionEngine.execute(messages)
  
  for chunk of stream:
    if chunk.type == "tool_use": hadToolCalls = true
    yield chunk
  
  if hadToolCalls: checkpointManager.save(state)
  if !hadToolCalls: break  // terminal state — no more tools needed
}
```

The loop exits when:
- No tool calls were returned (task complete).
- `maxIterations` is reached.
- User calls `cancel()` → `AbortController.abort()`.

**Rollback** is supported: `rollback(checkpointId)` restores `RuntimeState` from `CheckpointManager`.

### Supporting Classes

| Class | File | Role |
|---|---|---|
| `ExecutionEngine` | `executionEngine.ts` | Wraps the provider call, routes tool results back |
| `RuntimeStateManager` | `runtimeState.ts` | Mutable state (session, iteration count, executing flag) |
| `CheckpointManager` | `checkpoints.ts` | Stores and restores `RuntimeState` snapshots after each tool turn |
| `TaskQueue` | `taskQueue.ts` | Queues tasks for sequential agent execution |

---

## Provider Layer (`src/providers/`)

### AIProvider Interface

```typescript
interface AIProvider {
  readonly type: ProviderType;   // "anthropic" | "openai" | "ollama" | "openrouter"
  readonly config: ProviderConfig;
  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;
  dispose(): Promise<void>;
}
```

`send()` is always a streaming async generator. Chunks:

```typescript
type StreamChunk =
  | { type: "text";     content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; id, name, input }
  | { type: "error";    error, code? }
  | { type: "done";     stopReason?, usage? }
```

`TokenUsage` tracks `inputTokens`, `outputTokens`, `cacheReadTokens`, and `cacheWriteTokens`.

### Registry & Config

- `ProviderRegistry` (`src/providers/registry.ts`) — singleton `globalRegistry` that holds factory functions per provider type and creates `AIProvider` instances.
- `ProviderConfigManager` (`src/providers/config.ts`) — reads/writes provider settings from VSCode workspace configuration; prompts for API key when missing via `ensureApiKey()`.
- `AnthropicProvider` (`src/providers/anthropic.ts`) — concrete implementation for the Anthropic API.

---

## Harness (`src/harness/`)

The harness sits between the agent and every tool invocation. It enforces three independent concerns:

### ToolRegistry

`ToolRegistry` (and the exported `globalToolRegistry`) is the central catalog of all executable tools:

```typescript
interface Tool<TInput, TOutput> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;
  execute(input, context): Promise<ToolResult<TOutput>>;
  requiresApproval?(input, context): boolean;
  allowedInMode?(mode): boolean;
}
```

`ToolRegistry.execute()` pipeline:

1. Resolve tool by name (404 → error result).
2. Guard `allowedInMode` (rejects tools blocked in current mode).
3. `schema.safeParse(input)` — Zod validation.
4. Call `tool.execute()`.
5. Wrap result with `duration` and `approved` metadata.

`toProviderDefinitions()` converts registered tools to the JSON-Schema format expected by LLM provider APIs.

### PermissionManager

`PermissionManager` (exported as `globalPermissionManager`) implements a per-tool allowlist/denylist with expiring rules:

| Level | Behaviour |
|---|---|
| `always` | Auto-approve |
| `once` | Approve and remove rule |
| `never` | Auto-reject |
| `ask` | Prompt user (default) |

A **hardcoded denylist** blocks the most destructive patterns regardless of rules: `rm -rf`, `sudo`, `curl | bash`, `wget | sh`, fork bomb, `dd if=/dev/zero`, `mkfs`, `fdisk`.

The user-facing approval flow shows a modal VSCode dialog with risk level (`low` / `medium` / `high`) and four choices: *Approve Once*, *Always Allow*, *Reject*, *Never Allow*.

### ExecutionPolicy (`src/harness/executionPolicy.ts`)

High-level policy decisions layered on top of permissions (e.g., rate limiting, context-aware blocks).

### Sandbox (`src/harness/sandbox.ts`)

Provides isolation primitives for tool execution (path containment, environment scrubbing).

---

## Tools (`src/tools/`)

All tools are registered via `registerAllTools()` at extension activation.

| Module | Tools provided |
|---|---|
| `filesystem.ts` | File read/write/list/delete/search |
| `terminal.ts` | Shell command execution (via PTY) |
| `workspace.ts` | Workspace-level operations (open file, get diagnostics, etc.) |
| `index.ts` | Re-exports and calls `registerAllTools()` |

Each tool declares its Zod schema, mode restrictions, risk level for approval, and an `execute` implementation.

---

## Context Engine (`src/context/`)

The context engine builds a token-budgeted context window for each LLM call.

### Pipeline

```
WorkspaceIndexer ──► HeuristicRanker ──► ContextBuilder ──► ContextWindow
```

### WorkspaceIndexer (`indexing/workspaceIndexer.ts`)

Scans the workspace on `initialize()`. Tracks files, symbols, import graphs, and git state. Watches for file system changes and updates the index incrementally. Disposes all watchers on `dispose()`.

### HeuristicRanker (`ranking/heuristicRanker.ts`)

Scores indexed items for relevance given an `ExecutionContext`. Signals include:

- Currently open / active file.
- Files sharing imports with the active file.
- Recent git changes.
- Explicit user selection or mention.

### ContextBuilder (`retrieval/contextBuilder.ts`)

Accepts `ContextBuildOptions` (query, execution context, token budget) and calls the ranker. Greedily fills the budget and returns a `ContextWindow`.

`formatForProvider(contextWindow)` serialises the window to a string suitable for the LLM system prompt or user turn.

### TokenBudget (`tokenBudget.ts`)

Utility that tracks token consumption across included context items and enforces the configured `contextTokenBudget` (default 180 000 tokens).

### Types (`types.ts`)

Defines `ContextWindow`, `ContextItem`, `IndexedFile`, and related interfaces used across the context subsystem.

---

## Terminal System (`src/terminal/`)

| File | Role |
|---|---|
| `pty.ts` | Wraps `node-pty` to create a pseudo-terminal |
| `session.ts` | `SessionManager` — lifecycle management for PTY sessions; exported as `globalSessionManager` |
| `commandRunner.ts` | Higher-level API: run a shell command, capture output, handle timeouts |
| `types.ts` | `TerminalSession`, `CommandResult`, `CommandOptions` |

The terminal system allows the Agent to run shell commands inside PTY sessions, enabling interactive tools (compilers, package managers, tests).

---

## UI (`src/ui/`)

### KorixSidebarProvider (`sidebar/sidebarProvider.ts`)

Implements `vscode.WebviewViewProvider`. Renders the main chat/interaction panel as a WebviewView. Handles message passing between the extension host and the webview.

### TimelineProvider (`timeline/timelineProvider.ts`)

Implements `vscode.TreeDataProvider`. Exposes the timeline of agent actions and checkpoints in the Explorer sidebar.

---

## Telemetry (`src/telemetry/logger.ts`)

Lightweight structured logger wrapping the VSCode OutputChannel:

- Levels: `debug`, `info`, `warn`, `error`.
- Pretty-print in development (`NODE_ENV !== "production"`).
- `getLogger()` returns the process-global singleton after `initializeLogger()`.

Logs are written to the *Korix Code* output channel visible in VSCode's Output panel.

---

## Configuration

All settings live under the `korix.*` namespace in VSCode settings:

| Setting | Default | Description |
|---|---|---|
| `korix.provider` | `"anthropic"` | Active LLM provider |
| `korix.anthropic.model` | `"claude-sonnet-4-6"` | Model identifier |
| `korix.maxIterations` | `25` | Max agent loop iterations |
| `korix.contextTokenBudget` | `180000` | Token budget for context window |
| `korix.approvalFlow.enabled` | `true` | Show approval modal for risky tools |

---

## Build & Distribution

```
esbuild.config.js
  └── src/extension.ts  ──► dist/extension.js  (CommonJS bundle)
                        ──► dist/extension.js.map
tsconfig.json
  ├── target: ES2022
  ├── module: ES2022
  ├── strict: true (all strict flags on)
  └── paths: @/core/*, @/providers/*, @/harness/*, @/tools/*, …
```

Path aliases (`@/core/*`, `@/providers/*`, etc.) are defined in `tsconfig.json` and resolved by esbuild at bundle time — they do not reach the runtime.

The compiled bundle is the single artifact installed into VSCode as the extension main entry point.

---

## Keyboard Shortcuts

| Shortcut | Command |
|---|---|
| `Ctrl+Shift+A` / `Cmd+Shift+A` | `korix.ask` — Activate Ask mode |
| `Ctrl+Shift+K` / `Cmd+Shift+K` | `korix.agent` — Activate Agent mode |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | `korix.cancelExecution` — Cancel running agent |

---

## Data Flow: Agent Execution

```
User types prompt
      │
      ▼
korix.agent command ──► handleModeSwitch("agent")
      │
      ▼
AgentExecutor.execute(prompt, executionContext)
      │
      ▼
ContextEngine.buildContext(options)        ← workspace index + heuristic rank
      │
      ▼
AgentLoop.run(prompt)                      ← async generator
      │
  [iteration N]
      │
      ▼
ExecutionEngine.execute(messages)
      │
      ├─► AIProvider.send(input)           ← streaming LLM call
      │         │
      │    StreamChunk (text / tool_use / done)
      │         │
      │    if tool_use:
      │         │
      │         ▼
      │    PermissionManager.checkPermission(request)
      │         │  approved?
      │         ▼
      │    ToolRegistry.execute(name, input, ctx)
      │         │
      │    [Zod validate → tool.execute()]
      │         │
      │    ToolResult ──► append to messages
      │
      ├─► CheckpointManager.save(state)    ← after each tool turn
      │
      └─► repeat until no tool_use or maxIterations
```
