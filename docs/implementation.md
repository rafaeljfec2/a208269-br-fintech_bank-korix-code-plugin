# Korix Code — Implementation Reference

> Version 0.1.0 · VSCode Extension · TypeScript / ES2022

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Entry Point & Lifecycle](#entry-point--lifecycle)
3. [Mode System](#mode-system)
4. [Provider Layer](#provider-layer)
5. [Agent Runtime](#agent-runtime)
6. [Tool Harness](#tool-harness)
7. [Context Engine](#context-engine)
8. [Terminal System](#terminal-system)
9. [UI Layer](#ui-layer)
10. [Telemetry](#telemetry)
11. [Build & Configuration](#build--configuration)
12. [Key Type Contracts](#key-type-contracts)

---

## Architecture Overview

Korix Code is a VSCode extension that embeds a full AI-native coding runtime inside the Extension Host process. There is no separate Electron process or daemon — everything runs as a single extension.

```
src/
├── extension.ts          # Activation / deactivation entry point
├── core/
│   ├── types.ts          # Shared domain types (Mode, Message, Session…)
│   └── runtime/          # AgentLoop, ExecutionEngine, checkpoints, task queue
├── providers/            # LLM abstraction (Anthropic, OpenAI, Ollama, OpenRouter)
├── harness/              # Security layer: ToolRegistry, PermissionManager, Sandbox
├── tools/                # Concrete tool implementations (filesystem, terminal, workspace)
├── modes/                # ASK, PLAN, AGENT mode handlers + ModeManager
├── context/              # Workspace indexing, heuristic ranking, context building
├── terminal/             # node-pty integration, session management, command runner
├── ui/
│   ├── sidebar/          # Webview sidebar (KorixSidebarProvider)
│   └── timeline/         # TreeView timeline of agent actions
└── telemetry/            # Structured logger + metrics
```

Layering contract: layers may only import from the same layer or layers listed below them.

```
UI → modes → core/runtime → providers
         ↓
       harness → tools
         ↓
       context / terminal / telemetry
```

---

## Entry Point & Lifecycle

**File:** `src/extension.ts`

### Activation sequence (`activate`)

1. Create `OutputChannel("Korix Code")` and initialize the structured logger.
2. Instantiate `ProviderConfigManager` (reads/writes VS Code secret storage).
3. Call `initializeProvider()` — resolves saved Anthropic config; silently skips if none.
4. Call `initializeContextEngine()` and trigger async `contextEngine.initialize()`.
5. Call `initializeSessionManager()` and `initializeCommandRunner()` (terminal layer).
6. Call `registerAllTools()` — populates `globalToolRegistry`.
7. Register `KorixSidebarProvider` (Webview) and `TimelineProvider` (TreeView).
8. Create status-bar item, register all VSCode commands.

### Deactivation sequence (`deactivate`)

Calls `dispose()` in reverse order: active provider → global registry → context engine → session manager → output channel → status-bar item. All disposals are wrapped in try/catch so a missing subsystem cannot block shutdown.

### Mode indicator

The status-bar item shows the current mode emoji (`🔍 / 📋 / ⚙️`) and the mode name. Clicking it fires `korix.openSidebar`.

---

## Mode System

**Files:** `src/modes/modeManager.ts`, `src/modes/ask/handler.ts`, `src/modes/plan/decomposer.ts`, `src/modes/agent/executor.ts`

### Modes

| Mode    | Tools | Execution | Side-effects | Intent                           |
|---------|-------|-----------|--------------|----------------------------------|
| `ask`   | ✓     | ✗         | ✗            | Read-only analysis / explanation |
| `plan`  | ✓     | ✗         | ✗            | Task decomposition / planning    |
| `agent` | ✓     | ✓         | ✓            | Full agentic execution           |

### ModeManager

`ModeManager` extends `EventEmitter<{ modeChanged: (mode: Mode) => void }>`. Callers subscribe to `modeChanged` to react to transitions.

```typescript
const manager = new ModeManager();
manager.setMode("agent");
manager.canHaveSideEffects(); // true
manager.isReadOnly();          // false
```

`ModeConfigs` is a static `Record<Mode, ModeConfig>` that drives all capability checks — `allowTools`, `allowExecution`, `allowSideEffects`.

---

## Provider Layer

**Files:** `src/providers/types.ts`, `src/providers/anthropic.ts`, `src/providers/registry.ts`, `src/providers/config.ts`

### AIProvider interface

```typescript
interface AIProvider {
  readonly type: ProviderType;
  readonly config: ProviderConfig;
  send(input: ProviderInput): AsyncGenerator<StreamChunk, StreamMetadata, void>;
  dispose(): Promise<void>;
}
```

`send` returns an `AsyncGenerator`. Callers iterate chunks:

| Chunk type   | Payload                                |
|--------------|----------------------------------------|
| `text`       | `content: string` — incremental output |
| `thinking`   | `content: string` — model reasoning    |
| `tool_use`   | `id, name, input` — tool invocation    |
| `error`      | `error: string, code?: string`         |
| `done`       | `stopReason?, usage?`                  |

### AnthropicProvider

Wraps `@anthropic-ai/sdk`. Streams via `client.messages.create({ stream: true })`. When tools are present, a second non-streaming call is made to reliably extract `tool_use` blocks (known limitation — streaming tool accumulation is a future improvement).

### ProviderRegistry (`globalRegistry`)

Singleton registry. Providers are registered with a `ProviderFactory`. `globalRegistry.createProvider(config)` dispatches to the correct factory.

### ProviderConfigManager

Reads provider config from VS Code workspace settings and stores API keys in VS Code secret storage (`context.secrets`). Exposes `ensureApiKey(type)` which prompts the user if no key is stored.

---

## Agent Runtime

**Files:** `src/core/runtime/agentLoop.ts`, `src/core/runtime/executionEngine.ts`, `src/core/runtime/runtimeState.ts`, `src/core/runtime/checkpoints.ts`, `src/core/runtime/taskQueue.ts`

### AgentLoop

The main iterative loop drives tool-calling until either:
- no tool calls are returned (model is done), or
- `maxIterations` is reached, or
- the user calls `cancel()`.

```
AgentLoop.run(initialMessage)
  └─ while not done:
      ├─ stateManager.incrementIteration()
      ├─ yield { type: "iteration", iteration }
      ├─ executionEngine.execute(messages) → stream chunks
      ├─ yield each StreamChunk to caller
      └─ if hadToolCalls → checkpointManager.save(state)
```

Cancellation uses an `AbortController` — `cancel()` aborts the controller and calls `stateManager.stopExecution()`. The loop checks `abortController.signal.aborted` at the top of each iteration.

### RuntimeStateManager

Owns the mutable `RuntimeState`:

```typescript
interface RuntimeState {
  session: Session;
  context: ExecutionContext;
  isExecuting: boolean;
  currentIteration: number;
  maxIterations: number;
  checkpoints: Checkpoint[];
}
```

Key methods: `startExecution()`, `stopExecution()`, `incrementIteration()`, `addMessage()`, `hasReachedMaxIterations()`.

### CheckpointManager

Saves `Partial<RuntimeState>` snapshots after each tool-call round. `restore(id)` replays state back, enabling rollback. `AgentLoop.rollback(checkpointId)` delegates here.

### TaskQueue

Priority queue for decomposed sub-tasks, used primarily by `plan` mode decomposition before handing off to agent execution.

### ExecutionEngine

Bridges `RuntimeStateManager` → `AIProvider.send()`. Assembles the provider input (messages, tools list from `ToolRegistry.toProviderDefinitions()`, system prompt) and returns the raw stream for `AgentLoop` to iterate.

---

## Tool Harness

**Files:** `src/harness/toolRegistry.ts`, `src/harness/permissions.ts`, `src/harness/sandbox.ts`, `src/harness/executionPolicy.ts`

### ToolRegistry

`globalToolRegistry` is the singleton registry. Each `Tool<TInput, TOutput>` has:

- `schema: z.ZodSchema<TInput>` — input validated before execution.
- `execute(input, context): Promise<ToolResult<TOutput>>`.
- Optional `requiresApproval(input, context)` and `allowedInMode(mode)` guards.

`ToolRegistry.execute(name, input, context)` runs the full pipeline:
1. Look up tool, return error if missing.
2. Check `allowedInMode` — reject if mode disallows.
3. `schema.safeParse(input)` — reject on validation failure.
4. Call `tool.execute(validatedInput, context)`.
5. Wrap result with timing metadata.

`toProviderDefinitions(mode?)` serializes registered tools to Anthropic-compatible `ToolDefinition[]` for inclusion in provider requests. Uses a lightweight Zod → JSON Schema converter (ZodObject, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodOptional).

### Registered tools (v0.1.0)

| Tool            | File                      | Description            |
|-----------------|---------------------------|------------------------|
| `read_file`     | `src/tools/filesystem.ts` | Read file contents     |
| `run_command`   | `src/tools/terminal.ts`   | Execute shell command  |

Additional tool stubs: `src/tools/workspace.ts`.

### PermissionManager

`globalPermissionManager` implements a rule-based approval flow:

```
checkPermission(request)
  ├─ isBlocked() → hardcoded denylist check
  ├─ existing rule? → apply level (always/never/once/ask)
  └─ promptUser() → vscode.window.showWarningMessage (modal)
```

**Default denylist patterns:** `rm -rf`, `sudo`, `curl | bash`, `wget | sh`, fork bomb, `dd if=/dev/zero`, `mkfs`, `fdisk`.

**Permission levels:**

| Level    | Behavior                                           |
|----------|----------------------------------------------------|
| `always` | Auto-approve for this tool forever                 |
| `once`   | Approve and delete rule immediately after          |
| `never`  | Auto-reject for this tool forever                  |
| `ask`    | Show modal every time                              |

Rules are per-tool string keys, support optional `expiresAt` timestamps, and can be exported/imported for persistence.

---

## Context Engine

**Files:** `src/context/contextEngine.ts`, `src/context/indexing/workspaceIndexer.ts`, `src/context/ranking/heuristicRanker.ts`, `src/context/retrieval/contextBuilder.ts`, `src/context/tokenBudget.ts`, `src/context/types.ts`

### ContextEngine (facade)

```
ContextEngine
  ├─ WorkspaceIndexer   — builds WorkspaceIndex (files, symbols, imports)
  ├─ HeuristicRanker    — scores files → RankingScore[]
  └─ ContextBuilder     — fills ContextWindow within token budget
```

`buildContext(options)` → `ContextWindow` → `formatContext()` → provider-ready string.

### WorkspaceIndex

```typescript
interface WorkspaceIndex {
  files:      Map<string, FileInfo>;   // path → metadata + content
  symbols:    Map<string, SymbolInfo[]>;
  imports:    ImportInfo[];            // cross-file import graph
  lastIndexed: number;
}
```

### HeuristicRanker

Scores files with weighted signals:

| Signal             | Default weight |
|--------------------|----------------|
| `currentFile`      | highest        |
| `userSelection`    | high           |
| `directImports`    | high           |
| `gitDiff`          | medium         |
| `openTabs`         | medium         |
| `relatedSymbols`   | medium         |
| `recentlyModified` | low            |

Weights are typed as `HeuristicWeights` in `src/context/types.ts`.

### TokenBudget

Default budget: **180 000 tokens** (configurable via `korix.contextTokenBudget`). Token estimation: `Math.ceil(text.length / 4)` (characters → tokens approximation). Provides `canFit`, `allocate`, `getRemaining`, `getUtilization`, `logStatus`.

### ContextItem / ContextWindow

```typescript
interface ContextItem {
  file:       string;
  content:    string;
  priority:   number;
  tokenCount: number;
}

interface ContextWindow {
  items:       ContextItem[];
  totalTokens: number;
  budget:      number;
}
```

---

## Terminal System

**Files:** `src/terminal/session.ts`, `src/terminal/pty.ts`, `src/terminal/commandRunner.ts`, `src/terminal/types.ts`

- **`SessionManager`** — singleton managing PTY sessions. Each session wraps a `node-pty` pseudo-terminal. Initialized via `initializeSessionManager()`.
- **`CommandRunner`** — higher-level abstraction over `SessionManager`. Executes shell commands, captures stdout/stderr, enforces timeouts.
- **`Pty`** — low-level PTY wrapper (`node-pty`). Handles raw I/O, resize events, process lifecycle.

The `RunCommandTool` in `src/tools/terminal.ts` calls through `CommandRunner` so all terminal executions pass through the tool harness (permission checks, mode validation).

---

## UI Layer

**Files:** `src/ui/sidebar/sidebarProvider.ts`, `src/ui/timeline/timelineProvider.ts`

### KorixSidebarProvider

Registered as a `WebviewViewProvider` with view type `korix.sidebar`. Renders a Webview panel. Content is served from `extensionUri`-relative resources. Status: sidebar content is marked "Coming Soon" in v0.1.0.

### TimelineProvider

Implements `vscode.TreeDataProvider`. Registered under tree view ID `korix.timelineView`. Displays a chronological log of agent actions (tool calls, mode switches, checkpoints).

---

## Telemetry

**File:** `src/telemetry/logger.ts`

Structured logger backed by a VSCode `OutputChannel`. Initialized via `initializeLogger({ level, outputChannel, enablePrettyPrint })`. Retrieved anywhere via `getLogger()`.

Log levels: `debug | info | warn | error`.

`LogEntry` shape:

```typescript
interface LogEntry {
  level:     "debug" | "info" | "warn" | "error";
  message:   string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

`Metric` (for future use):

```typescript
interface Metric {
  name:       string;
  value:      number;
  unit:       string;
  timestamp:  number;
  tags?:      Record<string, string>;
}
```

Pretty-print is disabled in `NODE_ENV=production`.

---

## Build & Configuration

### Build

```bash
npm install
npm run compile   # esbuild + tsc type-check
```

**`esbuild.config.js`** bundles `src/extension.ts` → `dist/extension.js`. TypeScript targets **ES2022**, module resolution `node`, strict mode fully enabled (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUncheckedIndexedAccess`, etc.).

### VSCode settings

```jsonc
{
  "korix.provider":               "anthropic",
  "korix.anthropic.model":        "claude-sonnet-4-6",
  "korix.maxIterations":          25,
  "korix.contextTokenBudget":     180000,
  "korix.approvalFlow.enabled":   true
}
```

### Key bindings (default)

| Action           | Windows/Linux       | macOS             |
|------------------|---------------------|-------------------|
| Ask Mode         | `Ctrl+Shift+A`      | `Cmd+Shift+A`     |
| Agent Mode       | `Ctrl+Shift+K`      | `Cmd+Shift+K`     |
| Cancel Execution | `Ctrl+Shift+C`      | `Cmd+Shift+C`     |

---

## Key Type Contracts

### `Mode`

```typescript
type Mode = "ask" | "plan" | "agent";
```

### `Message`

```typescript
interface Message {
  role:      "user" | "assistant" | "tool";
  content:   string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### `ToolCall` / `ToolResult`

```typescript
interface ToolCall   { id: string; name: string; input: unknown; }
interface ToolResult { id: string; output: unknown; error?: string; metadata?: { duration: number; approved: boolean; }; }
```

### `ExecutionContext`

```typescript
interface ExecutionContext {
  mode:         Mode;
  workspaceRoot: string;
  currentFile?: string;
  selection?:   { start: Position; end: Position; text: string; };
  openFiles:    string[];
}
```

### `Session`

```typescript
interface Session {
  id:        string;
  mode:      Mode;
  messages:  Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
```

### `Config`

```typescript
interface Config {
  provider:             "anthropic" | "openai" | "ollama" | "openrouter";
  apiKey:               string;
  model:                string;
  maxIterations:        number;
  contextTokenBudget:   number;
  approvalFlowEnabled:  boolean;
  telemetryEnabled:     boolean;
}
```

---

*A follow-up doc is recommended for the Patch Engine (`src/patch/`) once that module is implemented.*
