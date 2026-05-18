# Tools API Reference

Comprehensive API documentation for all 18 tools in the Korix Code runtime.

## Table of Contents

- [Filesystem Tools](#filesystem-tools)
- [Git Tools](#git-tools)
- [Search Tools](#search-tools)
- [Diagnostics Tools](#diagnostics-tools)
- [Workspace Tools](#workspace-tools)
- [Terminal Tools](#terminal-tools)
- [Edit Tools](#edit-tools)

---

## Performance Tiers

Tools are categorized by performance targets:

- **Tier S** (< 50ms): ReadFile (cached), GetCurrentFile, GetOpenFiles, GetDiagnostics
- **Tier A** (< 200ms): SearchFiles, Grep, GitStatus, FindSymbols
- **Tier B** (< 1s): GitDiff, FindReferences, WorkspaceGraph
- **Tier C** (< 5s): TypeCheck, Full workspace search

---

## Filesystem Tools

### ReadFile

**Tier:** S (< 50ms cached) / A (< 200ms uncached)

Reads file contents from the workspace.

**Input Schema:**
```typescript
{
  path: string;          // Absolute or relative file path
  encoding?: string;     // File encoding (default: utf-8)
  startLine?: number;    // Optional: start line (1-indexed)
  endLine?: number;      // Optional: end line (inclusive)
}
```

**Output:**
```typescript
{
  content: string;       // File contents
  lines?: number;        // Total line count
  size?: number;         // File size in bytes
  encoding: string;      // Encoding used
}
```

**Caching:** ✅ Cached by path. Invalidated after WriteFile/EditFile on same path.

**Example:**
```typescript
const result = await registry.execute("ReadFile", {
  path: "src/index.ts"
}, context);

console.log(result.data?.content);
```

---

### WriteFile

**Tier:** A (< 200ms)

Writes content to a file, creating directories if needed.

**Input Schema:**
```typescript
{
  path: string;          // Target file path
  content: string;       // Content to write
  encoding?: string;     // Encoding (default: utf-8)
  createDirs?: boolean;  // Create parent directories (default: true)
}
```

**Output:**
```typescript
{
  path: string;          // Written file path
  size: number;          // Bytes written
  created: boolean;      // True if file was created (not overwritten)
}
```

**Cache Invalidation:** Invalidates ReadFile and ListDirectory caches for this path.

**Example:**
```typescript
await registry.execute("WriteFile", {
  path: "src/newFile.ts",
  content: "export const x = 1;"
}, context);
```

---

### ListDirectory

**Tier:** A (< 200ms)

Lists files and directories in a path.

**Input Schema:**
```typescript
{
  path: string;              // Directory path
  recursive?: boolean;       // Recursive listing (default: false)
  includeHidden?: boolean;   // Include hidden files (default: false)
  pattern?: string;          // Glob pattern filter
}
```

**Output:**
```typescript
{
  files: Array<{
    path: string;
    type: "file" | "directory";
    size?: number;
    modified?: number;        // timestamp
  }>;
  totalCount: number;
}
```

**Caching:** ✅ Cached by path. Invalidated after file changes in directory.

---

### SearchFiles

**Tier:** A (< 200ms for 1000 files)

Fast file search using ripgrep.

**Input Schema:**
```typescript
{
  pattern: string;           // Regex or glob pattern
  searchType: "name" | "content";
  includeHidden?: boolean;
  maxResults?: number;       // Default: 100
  fileTypes?: string[];      // e.g., ["ts", "tsx"]
  excludePaths?: string[];   // e.g., ["node_modules", "dist"]
}
```

**Output:**
```typescript
{
  results: Array<{
    file: string;            // For name search
    // OR for content search:
    file: string;
    line: number;
    column?: number;
    text: string;
    match?: string;
  }>;
  totalMatches: number;
}
```

**Caching:** ✅ Cached for 60s. Invalidated after file system changes.

**Example:**
```typescript
// Name search
const files = await registry.execute("SearchFiles", {
  pattern: "*.test.ts",
  searchType: "name"
}, context);

// Content search
const matches = await registry.execute("SearchFiles", {
  pattern: "export.*function",
  searchType: "content",
  fileTypes: ["ts", "tsx"]
}, context);
```

---

### FileChunks

**Tier:** B (< 1s)

Reads large files in chunks to avoid memory overflow.

**Input Schema:**
```typescript
{
  path: string;
  chunkSize?: number;        // Bytes per chunk (default: 64KB)
  startByte?: number;
  endByte?: number;
}
```

**Output:**
```typescript
{
  chunks: Array<{
    index: number;
    data: string;
    byteRange: [number, number];
  }>;
  totalSize: number;
}
```

**Use Case:** Reading multi-GB log files, large datasets.

---

## Git Tools

### GitStatus

**Tier:** A (< 200ms)

Gets git repository status using porcelain v2 format.

**Input Schema:**
```typescript
{} // No input required
```

**Output:**
```typescript
{
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  modified: string[];
  staged: string[];
  untracked: string[];
  conflicted: string[];
  renamed: Array<{ from: string; to: string }>;
  clean: boolean;
}
```

**Caching:** ✅ Cached for 5s. Invalidated after git commands or .git/ changes.

**Example:**
```typescript
const status = await registry.execute("GitStatus", {}, context);

if (!status.data?.clean) {
  console.log(`${status.data?.modified.length} files modified`);
}
```

---

### GitDiff

**Tier:** B (< 1s for 100 files)

Gets git diff in unified format.

**Input Schema:**
```typescript
{
  type: "staged" | "unstaged" | "commit";
  commitRange?: string;      // e.g., "HEAD~3..HEAD"
  files?: string[];          // Specific files
  contextLines?: number;     // Lines of context (default: 3)
}
```

**Output:**
```typescript
{
  diff: string;              // Unified diff format
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted";
    insertions: number;
    deletions: number;
  }>;
}
```

**Caching:** ✅ Cached for 10s. Invalidated after git operations.

---

### ChangedFiles

**Tier:** A (< 200ms)

Lists files changed since base branch.

**Input Schema:**
```typescript
{
  baseBranch?: string;       // Default: auto-detect (main/master)
  includeUntracked?: boolean; // Default: true
  statusFilter?: Array<"added" | "modified" | "deleted" | "renamed">;
}
```

**Output:**
```typescript
{
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    oldPath?: string;          // For renamed files
  }>;
  baseBranch: string;
}
```

**Use Case:** Context ranking (recently changed files have higher relevance).

---

## Search Tools

### Grep

**Tier:** A (< 200ms for 100 matches)

Fast text search using ripgrep with streaming.

**Input Schema:**
```typescript
{
  pattern: string;           // Regex pattern
  paths?: string[];          // Paths to search
  ignoreCase?: boolean;
  contextLines?: number;     // Lines before/after match
  maxResults?: number;
  fileTypes?: string[];
  excludePaths?: string[];
}
```

**Output:**
```typescript
{
  matches: Array<{
    file: string;
    line: number;
    column: number;
    text: string;
    match: string;
    context?: {
      before: string[];
      after: string[];
    };
  }>;
  totalMatches: number;
}
```

**Performance:** 10-100x faster than Node pure implementation.

---

### FindReferences

**Tier:** B (< 1s for 1000 refs)

Finds all references to a symbol using VSCode LSP.

**Input Schema:**
```typescript
{
  file: string;
  line: number;              // 0-indexed
  column: number;            // 0-indexed
}
```

**Output:**
```typescript
{
  references: Array<{
    file: string;
    line: number;
    column: number;
    text: string;
  }>;
  totalCount: number;
}
```

**Caching:** ✅ Cached for 5min. Invalidated on file changes.

---

### FindSymbols

**Tier:** A (< 200ms)

Searches for symbols in workspace using VSCode LSP.

**Input Schema:**
```typescript
{
  query: string;             // Symbol name pattern
  kind?: "function" | "class" | "interface" | "variable" | "constant" | 
         "method" | "property" | "enum" | "module";
  maxResults?: number;
}
```

**Output:**
```typescript
{
  symbols: Array<{
    name: string;
    kind: string;
    file: string;
    line: number;
    column: number;
    containerName?: string;  // Parent class/module
  }>;
  totalCount: number;
}
```

**Caching:** ✅ Cached for 5min. Invalidated on file changes.

---

## Diagnostics Tools

### Problems

**Tier:** S (< 50ms)

Aggregates all workspace diagnostics (errors, warnings, info).

**Input Schema:**
```typescript
{
  severity?: "error" | "warning" | "info" | "hint" | "all"; // Default: all
  maxResults?: number;       // Default: 100
  filesOnly?: string[];      // Filter by files
}
```

**Output:**
```typescript
{
  problems: Array<{
    file: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    severity: "error" | "warning" | "info" | "hint";
    message: string;
    source?: string;         // Language server name
    code?: string | number;
  }>;
  totalCount: number;
}
```

**Use Case:** Pre-commit validation, error context for fixes.

---

### GetDiagnostics

**Tier:** S (< 50ms)

Gets diagnostics for a specific file.

**Input Schema:**
```typescript
{
  file: string;
  severity?: "error" | "warning" | "info" | "hint" | "all";
}
```

**Output:** Same as Problems but filtered to single file.

---

## Workspace Tools

### WorkspaceGraph

**Tier:** B (< 1s for 5000 files)

Builds file relationship graph (imports, references).

**Input Schema:**
```typescript
{
  rootFile?: string;         // Start from specific file
  maxDepth?: number;         // Traversal depth (default: 3)
  includeSymbols?: boolean;  // Include symbol relationships (default: true)
}
```

**Output:**
```typescript
{
  nodes: Array<{
    path: string;
    imports: string[];
    importedBy: string[];
    symbols: string[];
    distance?: number;       // From root file
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: "import" | "reference";
  }>;
  totalFiles: number;
  totalImports: number;
}
```

**Use Case:** Context ranking (graph distance affects relevance).

---

### GetOpenFiles

**Tier:** S (< 50ms)

Gets list of currently open files in VSCode.

**Input Schema:**
```typescript
{} // No input
```

**Output:**
```typescript
{
  files: Array<{
    path: string;
    isDirty: boolean;
    languageId: string;
  }>;
}
```

---

### GetCurrentFile

**Tier:** S (< 50ms)

Gets the currently active file in VSCode editor.

**Input Schema:**
```typescript
{} // No input
```

**Output:**
```typescript
{
  path: string;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  languageId: string;
}
```

---

## Terminal Tools

### RunCommand

**Tier:** B (< 1s, depends on command)

Executes shell commands with security validation.

**Input Schema:**
```typescript
{
  command: string;
  cwd?: string;              // Working directory
  timeout?: number;          // Milliseconds
  env?: Record<string, string>;
}
```

**Output:**
```typescript
{
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

**Security:** High-risk commands require approval. Never bypasses git hooks.

**Cache Invalidation:** Git commands invalidate git tool caches.

---

## Edit Tools

### EditFile

**Tier:** A (< 200ms)

Applies precise edits to files using KORIX_PATCH format.

**Input Schema:**
```typescript
{
  path: string;
  edits: Array<{
    type: "replace" | "insert" | "delete";
    startLine: number;
    endLine?: number;
    content?: string;
  }>;
}
```

**Output:**
```typescript
{
  path: string;
  applied: number;           // Number of edits applied
  linesChanged: number;
}
```

**Cache Invalidation:** Invalidates ReadFile and git caches.

---

## Common Patterns

### Error Handling

All tools return `ToolResult<T>`:

```typescript
interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
    timestamp: number;
    cached?: boolean;
    cacheHitRate?: number;
  };
}
```

**Example:**
```typescript
const result = await registry.execute("ReadFile", input, context);

if (!result.success) {
  console.error(`ReadFile failed: ${result.error}`);
  return;
}

const content = result.data?.content;
```

### Caching

Tools are automatically cached based on:
- **Key:** Hash of (tool name + input)
- **TTL:** Tool-specific (5s to 5min)
- **Invalidation:** Automatic on file/git changes

Check if result was cached:
```typescript
if (result.metadata?.cached) {
  console.log(`Cache hit! (hit rate: ${result.metadata.cacheHitRate})`);
}
```

### Parallel Execution

Tools with no dependencies execute in parallel automatically:

```typescript
// These 3 tools run in parallel (3x faster):
await Promise.all([
  registry.execute("GitStatus", {}, context),
  registry.execute("GetOpenFiles", {}, context),
  registry.execute("SearchFiles", { pattern: "*.ts" }, context),
]);
```

Dependency detection is automatic:
```typescript
// Sequential execution (WriteFile → ReadFile dependency detected):
await registry.execute("WriteFile", { path: "test.ts", content: "..." }, context);
await registry.execute("ReadFile", { path: "test.ts" }, context);
```

---

## Performance Tips

1. **Use caching:** Read-only tools are cached. Second call is 10-100x faster.
2. **Batch operations:** Use parallel execution for independent tools.
3. **Limit results:** Use `maxResults` to avoid processing thousands of matches.
4. **Filter early:** Use `fileTypes`, `excludePaths` to reduce search space.
5. **Monitor metrics:** Check `metadata.duration` to identify slow operations.

---

## Next Steps

- [Testing Guide](testing-guide.md) - How to test tools
- [Performance Guide](performance.md) - Benchmarking and optimization
- [Tool Registry](../src/harness/toolRegistry.ts) - Source code
