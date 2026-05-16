# Frontend — Korix Code

Korix Code's frontend runs entirely inside the VSCode Extension Host as native VSCode UI primitives. There is no separate Electron process or bundled web app — all UI is delivered via VSCode's WebviewView and TreeDataProvider APIs.

## Architecture Overview

```
src/ui/
├── sidebar/
│   └── sidebarProvider.ts   # Chat WebviewView (korix.chatView)
└── timeline/
    └── timelineProvider.ts  # Execution history TreeView (korix.timelineView)
```

Both providers are instantiated in `src/extension.ts` during the `activate()` lifecycle and registered with VSCode's window API.

## Sidebar — `KorixSidebarProvider`

**File:** `src/ui/sidebar/sidebarProvider.ts`  
**VSCode view ID:** `korix.chatView`  
**Type:** `vscode.WebviewViewProvider`

The sidebar is the primary user-facing panel. It renders a self-contained HTML+JS page inside a `WebviewView` with scripting enabled and local resource roots scoped to the extension URI.

### Layout

```
┌─────────────────────────────┐
│  [Ask]  [Plan]  [Agent]      │  ← mode-selector
├─────────────────────────────┤
│                             │
│  messages                   │  ← scrollable message list
│                             │
├─────────────────────────────┤
│  [textarea]        [Send]   │  ← input-container
└─────────────────────────────┘
```

### Styling

All colours are mapped to VSCode theme tokens — the sidebar inherits the active colour theme automatically:

| CSS variable | Purpose |
|---|---|
| `--vscode-font-family` | Body font |
| `--vscode-foreground` | Default text |
| `--vscode-editor-background` | Body background |
| `--vscode-button-background` / `foreground` | Active mode button, send button, user messages |
| `--vscode-button-secondaryBackground` | Inactive mode buttons |
| `--vscode-input-background` / `border` / `foreground` | Textarea and assistant message bubble |
| `--vscode-panel-border` | Header and input-area dividers |
| `--vscode-inputOption-activeBackground` | System messages |

No external CSS framework is used. Styles are inlined in the HTML string returned by `getHtmlForWebview`.

### Message Types

| Role | Alignment | Background |
|---|---|---|
| `user` | `flex-end` | `--vscode-button-background` |
| `assistant` | `flex-start` | `--vscode-input-background` with border |
| `system` | `center` | `--vscode-inputOption-activeBackground`, 80% opacity |

### Webview ↔ Extension Messaging

The HTML page acquires the VS Code API via `acquireVsCodeApi()` and exchanges JSON messages in both directions.

**Webview → Extension (outbound):**

| `type` | Payload | Trigger |
|---|---|---|
| `sendMessage` | `{ message: string }` | Send button or Enter key |
| `changeMode` | `{ mode: Mode }` | Mode button click |

On the extension side, `sendMessage` dispatches `korix.handleUserMessage` and `changeMode` dispatches `korix.changeMode` via `vscode.commands.executeCommand`.

**Extension → Webview (inbound):**

| `type` | Payload | Effect |
|---|---|---|
| `addMessage` | `{ role, content, timestamp }` | Appends a message bubble; re-enables Send |
| `streamChunk` | `{ content: string }` | Appends text to the active streaming bubble |
| `clearMessages` | — | Empties message list; re-enables Send |
| `modeChanged` | `{ mode: Mode }` | Syncs active mode button highlight |

### Public API (called by extension core)

```typescript
sidebarProvider.setMode(mode: Mode): void
sidebarProvider.addMessage(role: 'user' | 'assistant' | 'system', content: string): void
sidebarProvider.streamChunk(content: string): void
sidebarProvider.clearMessages(): void
sidebarProvider.getCurrentMode(): Mode
```

### Streaming Behaviour

The webview tracks `streamingMessageDiv` — a reference to the last `assistant` bubble. `streamChunk` messages append text to that element; if no bubble exists yet, a new one is created. This enables incremental rendering of LLM output without re-rendering the full message list.

The Send button is disabled while the extension is processing (`sendBtn.disabled = true` on submit) and re-enabled when `addMessage` or `clearMessages` is received.

### Keyboard Shortcut

`Enter` (without `Shift`) submits the message. `Shift+Enter` inserts a newline.

## Timeline — `TimelineProvider`

**File:** `src/ui/timeline/timelineProvider.ts`  
**VSCode view ID:** `korix.timelineView`  
**Type:** `vscode.TreeDataProvider<TimelineItem>`

The Timeline panel renders a flat, reverse-chronological list of execution events in a VSCode Tree View. It is read-only from the user's perspective.

### `TimelineItem` shape

```typescript
interface TimelineItem {
  id: string;           // generated: `${Date.now()}-${random}`
  timestamp: number;    // Unix ms
  type: 'tool' | 'message' | 'checkpoint';
  description: string;  // shown as tree item label
  status: 'success' | 'error' | 'pending';
}
```

### Icon mapping

| `status` | ThemeIcon |
|---|---|
| `success` | `check` |
| `error` | `error` |
| `pending` | `clock` |

The tooltip shows `new Date(timestamp).toLocaleString()`.

### Public API

```typescript
timelineProvider.addItem(item: Omit<TimelineItem, 'id'>): void
timelineProvider.clear(): void
timelineProvider.refresh(): void
```

`addItem` generates a unique ID, pushes the item, and fires `onDidChangeTreeData`. `getChildren` returns items in reverse insertion order (most recent first).

## Status Bar

A status bar item is registered on the right side (priority 100) and bound to `korix.openSidebar`. It reflects the active mode:

| Mode | Display |
|---|---|
| `ask` | `🔍 Korix (ASK)` |
| `plan` | `📋 Korix (PLAN)` |
| `agent` | `⚙️ Korix (AGENT)` |

The tooltip reads: `Korix Code — <mode> mode\nClick to open sidebar`.

## Registered Commands

| Command ID | Icon | Action |
|---|---|---|
| `korix.ask` | `$(comment-discussion)` | Switch to Ask mode |
| `korix.plan` | `$(list-tree)` | Switch to Plan mode |
| `korix.agent` | `$(robot)` | Switch to Agent mode |
| `korix.openSidebar` | `$(sidebar-expand)` | Open sidebar (info message; full impl pending) |
| `korix.cancelExecution` | `$(stop)` | Cancel active execution |
| `korix.clearHistory` | — | Clear conversation history |

### Keyboard Bindings (from `package.json`)

| Key (Win/Linux) | Key (macOS) | Command |
|---|---|---|
| `Ctrl+Shift+A` | `Cmd+Shift+A` | `korix.ask` |
| `Ctrl+Shift+K` | `Cmd+Shift+K` | `korix.agent` |
| `Ctrl+Shift+C` | `Cmd+Shift+C` | `korix.cancelExecution` |

## Mode System

Three modes are defined in `src/core/types.ts` and shared across UI and runtime:

| Mode | Description |
|---|---|
| `ask` | Read-only contextual chat — explanations and analysis |
| `plan` | Task decomposition and architectural planning |
| `agent` | Full execution loop with tool calling and file editing |

Mode transitions originate from either the sidebar mode buttons (webview → extension via `changeMode` message) or VSCode commands (`korix.ask`, `korix.plan`, `korix.agent`). Both paths converge in `handleModeSwitch()` in `extension.ts`, which updates `currentMode`, refreshes the status bar, and shows an information message.

## Activation

The extension activates on `onStartupFinished`. UI providers are constructed once and stored as module-level singletons. Both are disposed automatically via `context.subscriptions`.

## Known Gaps / Follow-up Work

- `korix.openSidebar` currently shows a placeholder info message — the webview focus/reveal logic is not yet wired.
- `korix.handleUserMessage` and `korix.changeMode` commands are dispatched by the sidebar but not registered as named commands in the manifest; they are expected to be registered by the runtime layer.
- The webview HTML is an inline string in `getHtmlForWebview`; production hardening should move it to a bundled webview asset with a Content Security Policy header.
- Streaming renders plain text only — markdown rendering (code blocks, bold, lists) is not yet implemented.
- Timeline items have no `type`-specific icons — all three types (`tool`, `message`, `checkpoint`) share the same status-based icon set.
