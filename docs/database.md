# Database & Persistence

Korix Code does not use a traditional database (no SQL, no SQLite, no ORM, no IndexedDB). All runtime state is held in memory for the lifetime of the VSCode Extension Host process. Only two categories of data are persisted across sessions: **API keys** (via VSCode SecretStorage) and **user configuration** (via VSCode settings).

---

## Persistence Layers

### 1. VSCode SecretStorage — API Keys

API keys are stored in the OS keychain through VSCode's `ExtensionContext.secrets` API.

| Key pattern | Example | Content |
|---|---|---|
| `korix.apiKey.<provider>` | `korix.apiKey.anthropic` | Raw API key string |

**Implementation:** `src/providers/config.ts` — `ProviderConfigManager`

```ts
// write
await this.context.secrets.store(`korix.apiKey.${type}`, apiKey);

// read
const apiKey = await this.context.secrets.get(`korix.apiKey.${type}`);

// delete
await this.context.secrets.delete(`korix.apiKey.${type}`);
```

Providers: `anthropic` | `openai` | `ollama` | `openrouter`

---

### 2. VSCode Configuration API — User Settings

Extension settings are stored in the user's or workspace `settings.json` via `vscode.workspace.getConfiguration("korix")`.

| Setting key | Type | Default | Description |
|---|---|---|---|
| `korix.provider` | `string` | `"anthropic"` | Active LLM provider |
| `korix.anthropic.model` | `string` | `"claude-sonnet-4-6"` | Anthropic model ID |
| `korix.openai.model` | `string` | `"gpt-4-turbo"` | OpenAI model ID |
| `korix.ollama.model` | `string` | `"llama2"` | Ollama model ID |
| `korix.openrouter.model` | `string` | `"anthropic/claude-sonnet-4"` | OpenRouter model ID |
| `korix.ollama.baseUrl` | `string` | `"http://localhost:11434"` | Ollama endpoint |
| `korix.openrouter.baseUrl` | `string` | `"https://openrouter.ai/api/v1"` | OpenRouter endpoint |
| `korix.maxTokens` | `number` | — | Token limit per request |
| `korix.temperature` | `number` | — | Sampling temperature |
| `korix.maxIterations` | `number` | `25` | Agent loop iteration cap |
| `korix.contextTokenBudget` | `number` | `180000` | Context window budget (tokens) |
| `korix.approvalFlow.enabled` | `boolean` | `true` | Require approval for destructive actions |

**Implementation:** `src/providers/config.ts`, `src/core/types.ts` (`Config` interface)

---

## In-Memory Data Structures

All structures below are ephemeral — they are initialized on extension activation and lost on deactivation or VS Code restart.

### Session & Runtime State

**Owner:** `src/core/runtime/runtimeState.ts` — `RuntimeStateManager`

```ts
interface Session {
  id: string;          // "session-<timestamp>-<random>"
  mode: Mode;          // "ask" | "plan" | "agent"
  messages: Message[];
  createdAt: number;   // Unix ms
  updatedAt: number;   // Unix ms
  metadata?: Record<string, unknown>;
}

interface RuntimeState {
  session: Session;
  context: ExecutionContext;
  isExecuting: boolean;
  currentIteration: number;
  maxIterations: number;   // default 25
  checkpoints: Checkpoint[];
}
```

`RuntimeStateManager` emits events (`stateChanged`, `iterationComplete`, `executionStarted`, `executionCompleted`, `executionFailed`) via `eventemitter3`.

---

### Message

**Defined in:** `src/core/types.ts`

```ts
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;   // Unix ms
  metadata?: Record<string, unknown>;
}
```

Messages accumulate in `Session.messages` throughout a conversation. Cleared on `korix.clearHistory` command or `RuntimeStateManager.reset()`.

---

### Execution Context

**Defined in:** `src/core/types.ts`

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

Represents the VS Code editor state at the time of a request.

---

### Checkpoints

**Owner:** `src/core/runtime/checkpoints.ts` — `CheckpointManager`

```ts
interface Checkpoint {
  id: string;              // "checkpoint-<timestamp>-<random>"
  timestamp: number;       // Unix ms
  state: Partial<RuntimeState>;
  filesModified: string[]; // absolute file paths
}
```

Circular buffer: max **10** checkpoints per agent session (oldest evicted). Used for rollback and error recovery. Not persisted to disk.

---

### Workspace Index

**Owner:** `src/context/indexing/workspaceIndexer.ts` — `WorkspaceIndexer`

```ts
interface WorkspaceIndex {
  files: Map<string, FileInfo>;        // fsPath → FileInfo
  symbols: Map<string, SymbolInfo[]>;  // fsPath → symbols
  imports: ImportInfo[];
  lastIndexed: number;                 // Unix ms
}

interface FileInfo {
  path: string;
  content?: string;
  size: number;
  lastModified: number;
  language?: string;   // VSCode languageId
}

interface SymbolInfo {
  name: string;
  kind: string;        // VSCode SymbolKind name
  location: { file: string; line: number; column: number };
  containerName?: string;
}

interface ImportInfo {
  source: string;  // absolute path of importing file
  target: string;  // import path as written in source
  isExternal: boolean;
}
```

**Indexed file types:** `ts`, `tsx`, `js`, `jsx`, `py`, `go`, `rs`, `java`, `cpp`, `c`, `h` (max 1 000 files).

A `vscode.FileSystemWatcher` keeps the index up to date incrementally — files are re-indexed on create/change and removed on delete. Symbols are extracted via `vscode.executeDocumentSymbolProvider`; imports via regex.

---

### Context Window (Ephemeral per Request)

**Owner:** `src/context/retrieval/contextBuilder.ts`, `src/context/types.ts`

```ts
interface ContextItem {
  file: string;
  content: string;
  priority: number;
  tokenCount: number;
}

interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  budget: number;   // from korix.contextTokenBudget
}

interface RankingScore {
  file: string;
  score: number;
  reasons: string[];
}
```

Heuristic weights used during ranking (`src/context/ranking/heuristicRanker.ts`):

| Signal | Weight field |
|---|---|
| Current file | `currentFile` |
| User selection | `userSelection` |
| Direct imports | `directImports` |
| Git diff | `gitDiff` |
| Open tabs | `openTabs` |
| Related symbols | `relatedSymbols` |
| Recently modified | `recentlyModified` |

---

### Tool Call / Result

**Defined in:** `src/core/types.ts`

```ts
interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

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

---

### Telemetry (Log Entries & Metrics)

**Defined in:** `src/core/types.ts`; **owner:** `src/telemetry/logger.ts`

```ts
interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}
```

Logs are written to a VSCode `OutputChannel` ("Korix Code") via Pino. They are **not** written to disk. Pretty-print mode is enabled when `NODE_ENV !== "production"`.

---

## Data Lifecycle Summary

| Data | Storage | Survives restart? | Cleared by |
|---|---|---|---|
| API keys | VSCode SecretStorage (OS keychain) | Yes | `ProviderConfigManager.deleteApiKey()` |
| User settings | VSCode settings.json | Yes | User / VS Code settings UI |
| Session messages | In-memory | No | `clearHistory` command / `reset()` |
| Runtime state | In-memory | No | Extension deactivation |
| Checkpoints | In-memory | No | Extension deactivation |
| Workspace index | In-memory | No | Extension deactivation |
| Log output | VSCode OutputChannel | No | OutputChannel cleared / window closed |

---

## Adding Persistence (Future)

If durable storage becomes necessary, the recommended approach for a VSCode extension is:

- **`ExtensionContext.globalState`** (Memento API) — for small JSON-serializable values that should survive restarts.
- **`ExtensionContext.storageUri`** / **`globalStorageUri`** — for larger files (e.g., SQLite via `better-sqlite3` or a JSON database).
- **`ExtensionContext.secrets`** — already used for credentials; do not store non-sensitive data here.

Any schema migration strategy would need to be implemented manually, as no ORM is currently in scope.
