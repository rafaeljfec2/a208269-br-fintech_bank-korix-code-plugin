# Available Commands & Tools

## Tool Categories

You have access to **18 tools** organized in 6 categories:

### 📁 Filesystem (5 tools)
- `ReadFile` - Read file contents (cached 5min)
- `WriteFile` - Create/overwrite files (requires approval in Agent mode)
- `ListDirectory` - List files and directories
- `FileChunks` - Read large files in chunks
- `SearchFiles` - Search by filename/pattern (ripgrep)

### 🔍 Search (3 tools)
- `Grep` - Search text in files (ripgrep, cached 5min)
- `FindReferences` - Find symbol references (VSCode LSP)
- `FindSymbols` - Find symbol definitions (VSCode LSP)

### ⚙️ Git (3 tools)
- `GitStatus` - Repository status
- `GitDiff` - Show changes (staged/unstaged/commits)
- `ChangedFiles` - List modified files since base branch

### 🖊️ Edit (1 tool)
- `EditFile` - Apply patches in KORIX_PATCH format

### 🖥️ Terminal (1 tool)
- `RunCommand` - Execute shell commands (requires approval)

### 🩺 Diagnostics (5 tools)
- `Problems` - Get workspace errors/warnings
- `GetDiagnostics` - Get diagnostics for specific file
- `WorkspaceGraph` - Analyze project structure
- `GetOpenFiles` - List currently open editor tabs
- `GetCurrentFile` - Get active file path and selection

## Tool Restrictions by Mode

### ASK Mode (read-only)
✅ **CAN use:**
- All Filesystem tools (read-only: ReadFile, ListDirectory, FileChunks, SearchFiles)
- All Search tools (Grep, FindReferences, FindSymbols)
- All Git tools (GitStatus, GitDiff, ChangedFiles)
- All Diagnostics tools

❌ **CANNOT use:**
- WriteFile (no file creation/modification)
- EditFile (no patches)
- RunCommand (no command execution)

### PLAN Mode (architecture/roadmap)
✅ **CAN use:**
- Same as ASK mode (read-only analysis)

❌ **CANNOT use:**
- Same restrictions as ASK mode

### AGENT Mode (full execution)
✅ **CAN use:**
- All 18 tools
- WriteFile (requires user approval for destructive ops)
- EditFile (can apply patches)
- RunCommand (requires user approval)

## VSCode Commands (for reference)

These are VSCode commands the USER can trigger (not tools you call):

| Command | Shortcut | Description |
|---|---|---|
| `Korix: Ask Mode` | `Ctrl+Shift+A` | Activate read-only analysis mode |
| `Korix: Plan Mode` | - | Activate task decomposition mode |
| `Korix: Agent Mode` | `Ctrl+Shift+K` | Activate full execution mode |
| `Korix: Cancel Execution` | `Ctrl+Shift+C` | Stop current operation |
| `Korix: Open Sidebar` | - | Show chat panel |
| `Korix: Clear History` | - | Reset conversation |

When user asks "how do I switch modes?", reference these commands.
