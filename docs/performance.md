# Performance Guide - Korix Code Tools

Comprehensive guide for benchmarking, optimization, and troubleshooting tool performance.

## Table of Contents

- [Performance Philosophy](#performance-philosophy)
- [Performance Tiers](#performance-tiers)
- [Metrics Collection](#metrics-collection)
- [Running Benchmarks](#running-benchmarks)
- [Cache Optimization](#cache-optimization)
- [Parallel Execution](#parallel-execution)
- [Troubleshooting](#troubleshooting)
- [Optimization Strategies](#optimization-strategies)

---

## Performance Philosophy

### Core Principles

**Local-first performance:**
- Response time < 100ms for common operations
- Incremental results via streaming
- Aggressive caching with smart invalidation
- Parallel execution when possible

**Measurement-driven optimization:**
- Every tool tracks duration metadata
- Aggregate metrics for p50/p95/p99
- Cache hit rate monitoring
- Performance regression detection

**Graceful degradation:**
- Fallback to slower alternatives (ripgrep → Node fs)
- Timeout protection (abort slow operations)
- Progressive result streaming

---

## Performance Tiers

Tools are categorized by expected execution time:

### Tier S (< 50ms) - Ultra Fast

**Characteristics:**
- In-memory operations
- Zero I/O or cached I/O
- Direct VSCode API calls
- Sub-frame response time

**Tools:**
- ReadFile (cached)
- GetCurrentFile
- GetOpenFiles
- GetDiagnostics (cached)

**Target:** p95 < 50ms

---

### Tier A (< 200ms) - Fast

**Characteristics:**
- Single file/directory I/O
- Indexed search operations
- Lightweight git operations
- LSP queries

**Tools:**
- SearchFiles (ripgrep, ≤1000 files)
- Grep (≤100 matches)
- GitStatus
- FindSymbols
- ReadFile (uncached)
- ListDirectory

**Target:** p95 < 200ms

---

### Tier B (< 1s) - Acceptable

**Characteristics:**
- Multiple file operations
- Complex git operations
- LSP workspace queries
- Graph traversal

**Tools:**
- GitDiff (≤100 files)
- FindReferences (≤1000 refs)
- WorkspaceGraph (≤5000 files)
- FileChunks (large files)

**Target:** p95 < 1000ms

---

### Tier C (< 5s) - Slow

**Characteristics:**
- Full workspace scans
- TypeScript compilation
- Deep graph analysis

**Tools:**
- TypeCheck (full tsc run)
- WorkspaceGraph (>5000 files)
- Full workspace search (>10,000 files)

**Target:** p95 < 5000ms

**Note:** Tier C tools should be rare in agent loops. Consider optimizations if used frequently.

---

## Metrics Collection

### Automatic Tracking

Every tool execution records:
```typescript
interface ToolMetric {
  tool: string;           // Tool name
  timestamp: number;      // Unix ms
  duration: number;       // Execution time (ms)
  cached: boolean;        // Cache hit?
  success: boolean;       // Execution success?
  inputSize: number;      // Bytes
  outputSize: number;     // Bytes
}
```

### Aggregated Metrics

Accessible via `ToolMetrics.getMetrics()`:
```typescript
interface AggregatedMetrics {
  tool: string;
  invocations: number;
  p50Duration: number;    // Median
  p95Duration: number;    // 95th percentile
  p99Duration: number;    // 99th percentile
  cacheHitRate: number;   // 0.0 - 1.0
  errorRate: number;      // 0.0 - 1.0
  avgInputSize: number;
  avgOutputSize: number;
}
```

### Global Metrics

Cross-tool metrics:
```typescript
const metrics = toolRegistry.getMetrics().getGlobalMetrics();

console.log({
  totalInvocations: metrics.totalToolInvocations,
  cacheHitRate: metrics.globalCacheHitRate,
  avgDuration: metrics.avgDuration,
  errorRate: metrics.globalErrorRate,
});
```

---

## Running Benchmarks

### Setup

Install dependencies:
```bash
pnpm install
```

Ensure clean state:
```bash
git clean -fdx dist/
pnpm run build
```

### Benchmark Suite

Run all performance benchmarks:
```bash
pnpm run test:bench
```

This executes three benchmark suites:

**1. Performance Targets** (`src/tools/__benchmarks__/performance.bench.ts`)
- Validates Tier S/A/B/C targets
- 100 iterations for Tier S
- 50 iterations for Tier A
- 20 iterations for Tier B
- 10 iterations for Tier C

**2. Cache Performance** (`src/tools/__benchmarks__/cache.bench.ts`)
- Validates cache hit rate > 40%
- Simulates typical agent session
- Measures cache effectiveness

**3. Parallel Execution** (`src/tools/__benchmarks__/parallel.bench.ts`)
- Compares sequential vs parallel execution
- Validates >2x speedup for 3+ independent tools
- Measures scheduler overhead

### Single Benchmark

Run specific benchmark file:
```bash
pnpm vitest run src/tools/__benchmarks__/performance.bench.ts
```

### Watch Mode

Continuous benchmarking during development:
```bash
pnpm vitest --watch src/tools/__benchmarks__/
```

---

## Cache Optimization

### Cache Strategy

**ToolCache** uses segmented LRU:
- **Hot partition** (20%): Recently/frequently accessed
- **Cold partition** (80%): Infrequently accessed
- **Promotion:** Access count threshold (3 hits)
- **Eviction:** LRU within each partition

### Cache Configuration

Default policy:
```typescript
{
  maxSize: 50 * 1024 * 1024,  // 50 MB
  maxAge: 5 * 60 * 1000,       // 5 minutes
  maxEntries: 1000,
}
```

### Cache Invalidation

**Automatic invalidation** after:
- WriteFile/EditFile → ReadFile cache for same path
- WriteFile/EditFile → ListDirectory cache for parent dir
- .git/ modifications → All git tools cache
- RunCommand (git) → All git tools cache

**Manual invalidation:**
```typescript
// Invalidate specific pattern
toolRegistry.invalidateCache(/^ReadFile.*file\.ts/);

// Invalidate all git tools
toolRegistry.invalidateCache(/^Git/);

// Invalidate all
toolRegistry.invalidateCache(/.*/);
```

### Cache Metrics

Check cache effectiveness:
```typescript
const stats = toolRegistry.getCache().getStats();

console.log({
  hitRate: stats.hitRate,           // 0.0 - 1.0
  size: stats.totalSize,             // Bytes
  entries: stats.totalEntries,
  evictions: stats.evictions,
  invalidations: stats.invalidations,
  hotPartitionSize: stats.hotPartitionSize,
  coldPartitionSize: stats.coldPartitionSize,
});
```

**Target:** hitRate > 0.40 (40%) in typical agent sessions

---

## Parallel Execution

### Automatic Parallelization

ExecutionEngine automatically parallelizes tool calls with no dependencies:

**Sequential execution:**
```typescript
// Tools execute one-by-one (slow)
await readFile("a.ts");
await readFile("b.ts");
await readFile("c.ts");
// Total: ~150ms (3 × 50ms)
```

**Parallel execution:**
```typescript
// Tools execute concurrently (fast)
await Promise.all([
  readFile("a.ts"),
  readFile("b.ts"),
  readFile("c.ts"),
]);
// Total: ~50ms (max of 3 × 50ms)
```

### Dependency Detection

**Heuristics for detecting dependencies:**

1. **Path-based:**
   - ReadFile depends on prior WriteFile/EditFile to same path
   - ListDirectory depends on prior file additions/deletions in dir

2. **Tool type:**
   - Git tools depend on prior `git` commands (RunCommand)
   - Search tools independent (can run in parallel)
   - Diagnostics independent

**Example:**
```typescript
// Automatically detected dependencies:
WriteFile("a.ts", "...")       // Task 0
ReadFile("a.ts")               // Task 1 → depends on Task 0
ReadFile("b.ts")               // Task 2 → independent, runs parallel with Task 1
```

### Priority Scheduling

Tools assigned priority (0-10, higher = more urgent):

| Priority | Tool Type                | Examples                        |
|----------|-------------------------|---------------------------------|
| 8-10     | Write operations        | WriteFile, EditFile, DeleteFile |
| 7        | Commands                | RunCommand                      |
| 6        | Git operations          | GitStatus, GitDiff              |
| 5        | Search operations       | SearchFiles, Grep               |
| 3-4      | Read operations         | ReadFile, ListDirectory         |
| 1-2      | Diagnostics             | Problems, GetDiagnostics        |

**High priority tools execute first** when no dependencies block them.

### Measuring Speedup

Benchmark parallel vs sequential:
```typescript
// Sequential baseline
const start = Date.now();
await toolRegistry.execute("SearchFiles", {...}, context);
await toolRegistry.execute("GitStatus", {}, context);
await toolRegistry.execute("GetOpenFiles", {}, context);
const sequential = Date.now() - start;

// Parallel execution
const start2 = Date.now();
const scheduler = toolRegistry.getScheduler();
await scheduler.scheduleMany([
  { id: "1", tool: "SearchFiles", input: {...}, priority: 5 },
  { id: "2", tool: "GitStatus", input: {}, priority: 6 },
  { id: "3", tool: "GetOpenFiles", input: {}, priority: 3 },
]);
const parallel = Date.now() - start2;

console.log(`Speedup: ${(sequential / parallel).toFixed(2)}x`);
// Expected: >2x for 3+ independent tools
```

---

## Troubleshooting

### Slow Tool Execution

**Symptom:** Tool takes longer than tier target

**Diagnosis:**
1. Check tool metrics:
   ```typescript
   const metrics = toolRegistry.getMetrics().getMetrics("SlowTool");
   console.log({ p95: metrics.p95Duration, p99: metrics.p99Duration });
   ```

2. Check cache hit rate:
   ```typescript
   console.log({ hitRate: metrics.cacheHitRate });
   ```

3. Enable debug logging:
   ```typescript
   logger.setLevel("debug");
   ```

**Common causes:**

**1. Cold cache (first run)**
- **Solution:** Second execution should be faster (cache warm)

**2. Large input/output**
- **Symptom:** `avgInputSize` or `avgOutputSize` > 1MB
- **Solution:** Use streaming (FileChunks), pagination, or filters

**3. Ripgrep not installed**
- **Symptom:** SearchFiles/Grep error "ripgrep not found"
- **Solution:** Install ripgrep (`brew install ripgrep`, `apt install ripgrep`)
- **Fallback:** Node fs scan (10-100x slower, automatic)

**4. Large workspace**
- **Symptom:** SearchFiles slow despite ripgrep
- **Solution:** Use `excludePaths: ["node_modules", "dist"]`, `maxResults`

**5. I/O bottleneck**
- **Symptom:** Multiple read-heavy tools slow
- **Solution:** Verify SSD (not HDD), check disk usage

---

### Low Cache Hit Rate

**Symptom:** `cacheHitRate < 0.30` (below 30%)

**Diagnosis:**
```typescript
const stats = toolRegistry.getCache().getStats();
console.log({
  hitRate: stats.hitRate,
  evictions: stats.evictions,       // High evictions = cache too small
  invalidations: stats.invalidations, // High invalidations = too aggressive
});
```

**Common causes:**

**1. Cache too small**
- **Symptom:** High eviction count
- **Solution:** Increase `maxSize` or `maxEntries` in ToolCache config

**2. Short TTL**
- **Symptom:** High age-based evictions
- **Solution:** Increase `maxAge` (default 5min)

**3. Too many unique inputs**
- **Symptom:** Cache size grows but hit rate low
- **Cause:** Tool called with many different inputs (e.g., different files)
- **Solution:** Expected behavior, cache still helps for repeated calls

**4. Aggressive invalidation**
- **Symptom:** High invalidation count
- **Solution:** Review invalidation patterns, may be too broad

---

### Parallel Execution Not Working

**Symptom:** Tools still execute sequentially

**Diagnosis:**
1. Check dependencies:
   ```typescript
   // Add debug logging in prepareSchedulerTasks()
   console.log({ tasks: tasks.map(t => ({ id: t.id, deps: t.dependencies })) });
   ```

2. Verify scheduler usage:
   ```typescript
   // ExecutionEngine should call scheduler.scheduleMany()
   // Not individual execute() calls
   ```

**Common causes:**

**1. Over-detected dependencies**
- **Symptom:** Most tasks have dependencies
- **Cause:** Heuristic too conservative
- **Solution:** Review prepareSchedulerTasks() logic

**2. Not using scheduler**
- **Symptom:** Code uses sequential for-loop
- **Cause:** ExecutionEngine not refactored
- **Solution:** Verify executeToolCalls() uses scheduler.scheduleMany()

**3. Single tool call**
- **Symptom:** Only one tool per iteration
- **Cause:** LLM not generating multiple tool calls
- **Solution:** Expected behavior, parallel only helps with 2+ tools

---

### Memory Issues

**Symptom:** High memory usage, OOM errors

**Diagnosis:**
```typescript
const stats = toolRegistry.getCache().getStats();
console.log({ totalSize: stats.totalSize / 1024 / 1024 + " MB" });
```

**Common causes:**

**1. Large cache**
- **Symptom:** `totalSize > 100MB`
- **Solution:** Reduce `maxSize` config

**2. Large file reads**
- **Symptom:** ReadFile on multi-GB files
- **Solution:** Use FileChunks tool instead

**3. Memory leaks**
- **Symptom:** Memory grows over time
- **Solution:** Check for unclosed streams, dangling references

---

## Optimization Strategies

### Strategy 1: Reduce I/O

**Problem:** Slow disk reads

**Solutions:**
- **Caching:** Enable/increase cache for read-heavy tools
- **Streaming:** Use FileChunks for large files
- **Filtering:** Use `maxResults`, `excludePaths` to reduce scan size
- **Indexing:** Pre-build workspace index (future)

**Example:**
```typescript
// Before: Read entire 10MB file
const result = await ReadFile.execute({ path: "large.log" }, context);

// After: Read in chunks
const result = await FileChunks.execute({ 
  path: "large.log", 
  chunkSize: 64 * 1024  // 64KB chunks
}, context);
```

---

### Strategy 2: Maximize Parallelism

**Problem:** Sequential execution wasting time

**Solutions:**
- **Independent tools:** Ensure no false dependencies
- **Priority tuning:** Adjust priorities for critical tools
- **Batch operations:** Group similar operations

**Example:**
```typescript
// Before: Sequential (slow)
const files = await SearchFiles.execute({...}, context);
const status = await GitStatus.execute({}, context);
const refs = await FindReferences.execute({...}, context);

// After: Parallel (fast)
const [files, status, refs] = await Promise.all([
  SearchFiles.execute({...}, context),
  GitStatus.execute({}, context),
  FindReferences.execute({...}, context),
]);
```

---

### Strategy 3: Optimize Cache

**Problem:** Low cache hit rate

**Solutions:**
- **Normalize inputs:** Consistent path formats (absolute vs relative)
- **Stable keys:** Use canonical input representation
- **Longer TTL:** Increase `maxAge` for stable data
- **Larger cache:** Increase `maxSize` if memory allows

**Example:**
```typescript
// Before: Cache misses due to different path formats
await ReadFile.execute({ path: "/workspace/file.ts" }, context);
await ReadFile.execute({ path: "file.ts" }, context);  // Cache miss!

// After: Normalize to absolute paths
const absPath = path.resolve(workspaceRoot, "file.ts");
await ReadFile.execute({ path: absPath }, context);  // Cache hit!
```

---

### Strategy 4: Use Ripgrep

**Problem:** Slow search operations

**Solutions:**
- **Install ripgrep:** 10-100x faster than Node fs
- **Use JSON output:** Easier parsing (`rg --json`)
- **Tune flags:** `--max-count`, `--type`, `--iglob`

**Verification:**
```bash
# Check ripgrep installed
which rg

# Test performance
time rg "pattern" --files
```

---

### Strategy 5: Lazy Evaluation

**Problem:** Computing data not needed

**Solutions:**
- **Streaming:** Yield results incrementally
- **Pagination:** Fetch only requested page
- **On-demand:** Compute only when accessed

**Example:**
```typescript
// Before: Compute all results upfront
async function searchFiles(pattern: string): Promise<string[]> {
  const files = await glob(pattern);  // Blocks until all found
  return files;
}

// After: Stream results
async function* searchFiles(pattern: string): AsyncGenerator<string> {
  for await (const file of globStream(pattern)) {
    yield file;  // Consumer can stop early
  }
}
```

---

### Strategy 6: Profiling

**Problem:** Unknown bottleneck

**Tools:**
- **Node.js profiler:** `node --prof`, `node --cpu-prof`
- **Chrome DevTools:** `--inspect` flag
- **Metrics:** Tool-level duration tracking

**Workflow:**
1. Enable profiling:
   ```bash
   node --prof ./dist/extension.js
   ```

2. Reproduce slow operation

3. Analyze profile:
   ```bash
   node --prof-process isolate-*.log
   ```

4. Identify hot functions

5. Optimize (cache, algorithm, I/O)

---

## Performance Checklist

Use this checklist when optimizing tools:

**Tier S (<50ms):**
- ✅ Zero I/O or cached reads only
- ✅ No external process spawns
- ✅ In-memory data structures
- ✅ Cache hit rate > 80%

**Tier A (<200ms):**
- ✅ Single file/directory I/O
- ✅ Use ripgrep for search
- ✅ Cache enabled (60s TTL)
- ✅ Results limited (maxResults)

**Tier B (<1s):**
- ✅ Streaming for large data
- ✅ Parallel I/O when possible
- ✅ Progress reporting
- ✅ Abort signal support

**Tier C (<5s):**
- ✅ Incremental results
- ✅ Timeout protection (abort after 10s)
- ✅ Warn user if slow
- ✅ Consider background execution

---

## Benchmarking Best Practices

### 1. Isolate Tests

Run benchmarks on idle system:
- Close other applications
- Disable background tasks (indexing, backups)
- Use consistent hardware

### 2. Warm Up

First iteration is always slower (cold cache, JIT):
```typescript
// Warm-up phase
for (let i = 0; i < 10; i++) {
  await tool.execute(input, context);
}

// Benchmark phase
const results = [];
for (let i = 0; i < 100; i++) {
  const start = Date.now();
  await tool.execute(input, context);
  results.push(Date.now() - start);
}
```

### 3. Multiple Iterations

Run 50-100 iterations for stable p95/p99:
```typescript
bench("ToolName", async () => {
  await tool.execute(input, context);
}, { iterations: 100 });
```

### 4. Realistic Data

Use production-like inputs:
- Real file sizes (not toy examples)
- Typical search patterns
- Representative workspace size

### 5. Report Percentiles

Mean is misleading (outliers skew it):
```typescript
const p50 = percentile(results, 0.50);  // Median
const p95 = percentile(results, 0.95);  // 95th percentile
const p99 = percentile(results, 0.99);  // 99th percentile

console.log({ p50, p95, p99 });
```

---

## Next Steps

- [Tools API Reference](tools-api.md) - API documentation for all tools
- [Testing Guide](testing-guide.md) - How to test tools
- [Tool Registry](../src/harness/toolRegistry.ts) - Source code

---

## Performance Targets Summary

| Tier | Target    | Tools                                      | Iterations |
|------|-----------|--------------------------------------------|------------|
| S    | < 50ms    | ReadFile (cached), GetCurrentFile          | 100        |
| A    | < 200ms   | SearchFiles, Grep, GitStatus               | 50         |
| B    | < 1s      | GitDiff, FindReferences, WorkspaceGraph    | 20         |
| C    | < 5s      | TypeCheck, Full workspace scan             | 10         |

**Cache Target:** Hit rate > 40% in typical agent sessions

**Parallel Target:** Speedup > 2x for 3+ independent tools
