import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BackgroundContextIndexer,
  benchmarkContextQuality,
  BoundedContextWorkerPool,
  CONTEXT_COMPILER_CACHE_STRATEGY,
  ContextQualityTelemetryBuffer,
  createContextCompilerDebugSnapshot,
  createContextCacheGraphEdges,
  createContextCacheSnapshot,
  createContextGraphSnapshot,
  createContextQualityTelemetrySample,
  FallbackContextCompiler,
  formatContextIrForProvider,
  getContextCompilerCapabilities,
  getContextCompilerCacheStrategy,
  getDefaultContextLanguageAdapters,
  hashWorkspaceFileContent,
  isNodeSQLiteRuntimeAvailable,
  optimizeReplacementPatch,
  optimizeToolOutput,
  rankEmbeddingFallback,
  runContextQualityBenchmarkFixtures,
  resolveContextLanguageAdapter,
  summarizeContextQualityBenchmarks,
  type BuildContextIrRequest,
  type ContextIR,
} from "@korix/context-compiler";

function createContextIr(overrides: Partial<ContextIR> = {}): ContextIR {
  return {
    version: "0.1",
    task: {
      userPrompt: "Fix login",
      mentionedSymbols: ["login"],
      constraints: [],
    },
    workspace: {
      root: "/workspace",
      languageHints: ["typescript"],
      openFiles: ["/workspace/src/login.ts"],
      changedFiles: [],
    },
    budget: {
      maxTokens: 100,
      estimatedTokens: 20,
      tokensBeforeOptimization: 80,
    },
    context: {
      symbols: [
        {
          id: "symbol-login",
          name: "login",
          kind: "function",
          file: "/workspace/src/login.ts",
          range: {
            startLine: 1,
            endLine: 3,
          },
          score: 1,
          scoreFactors: [],
          reasons: [{ code: "mentioned_symbol", detail: "login" }],
          contentMode: "source",
          content: "export function login() { return true; }",
          dependencies: [],
          estimatedTokens: 10,
        },
      ],
      files: [
        {
          path: "/workspace/src/login.ts",
          score: 1,
          scoreFactors: [],
          includedMode: "partial",
          reasons: [{ code: "active_file" }],
          estimatedTokens: 10,
          content: "export function login() { return true; }",
        },
        {
          path: "/workspace/src/types.ts",
          score: 0.5,
          scoreFactors: [],
          includedMode: "metadata",
          reasons: [],
          estimatedTokens: 1,
        },
      ],
      summaries: [],
      diagnostics: [
        {
          path: "/workspace/src/login.ts",
          message: "Type mismatch",
          severity: "error",
        },
        {
          path: "/workspace/src/session.ts",
          message: "Missing return",
        },
      ],
    },
    omitted: [
      {
        id: "file-unused",
        kind: "file",
        path: "/workspace/src/unused.ts",
        score: 0.1,
        reason: "low_score",
      },
    ],
    metrics: {
      contextBuildLatencyMs: 1,
      selectedFilesCount: 2,
      selectedSymbolsCount: 1,
      selectedDiagnosticsCount: 1,
      selectedRelevantSymbolsCount: 1,
      legacyBaselineTokens: 80,
      tokenSavingsPercent: 75,
      contextValuePerToken: 0.05,
      cacheHitRatio: 0,
    },
    ...overrides,
  };
}

function createRequest(
  overrides: Partial<BuildContextIrRequest> = {},
): BuildContextIrRequest {
  return {
    userPrompt: "Fix login",
    workspaceRoot: "/workspace",
    activeFile: "/workspace/src/login.ts",
    openFiles: ["/workspace/src/login.ts"],
    changedFiles: [],
    mentionedSymbols: ["login"],
    diagnostics: [
      {
        path: "/workspace/src/login.ts",
        message: "Type mismatch",
      },
    ],
    maxTokens: 100,
    files: [
      {
        path: "/workspace/src/login.ts",
        content: "export function login() { return true; }",
        language: "typescript",
      },
      {
        path: "/workspace/src/session.ts",
        content: "export function createSession() { return true; }",
        language: "typescript",
      },
    ],
    ...overrides,
  };
}

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: () => resolve?.(),
  };
}

describe("context compiler package", () => {
  it("exposes versioned package capabilities without overstating experimental features", () => {
    const capabilities = getContextCompilerCapabilities();

    expect(capabilities.packageName).toBe("@korix/context-compiler");
    expect(capabilities.contextIrVersion).toBe("0.1");
    expect(capabilities.features).toContainEqual({
      name: "context-ir",
      status: "stable",
      detail: "Versioned ContextIR contract and provider formatter.",
    });
    expect(capabilities.features).toContainEqual({
      name: "quality-benchmarks",
      status: "experimental",
      detail:
        "Deterministic context evidence, outcome and value-per-token benchmarks.",
    });
    expect(capabilities.features).toContainEqual({
      name: "quality-telemetry",
      status: "experimental",
      detail:
        "In-memory collection of observed patch and task outcomes for context quality samples.",
    });
    expect(capabilities.features).toContainEqual({
      name: "worker-pools",
      status: "experimental",
      detail:
        "Package-level bounded async worker pool for future background indexing.",
    });
    expect(capabilities.features).toContainEqual({
      name: "background-indexing",
      status: "experimental",
      detail:
        "Package-level background indexing scheduler over compiler index operations.",
    });
    expect(capabilities.features).toContainEqual({
      name: "graph-snapshots",
      status: "experimental",
      detail:
        "Deterministic workspace graph snapshots derived from cache metadata.",
    });
    expect(capabilities.features).toContainEqual({
      name: "debug-snapshots",
      status: "experimental",
      detail: "Compact observability snapshots without source content.",
    });
    expect(capabilities.features).toContainEqual({
      name: "language-adapters",
      status: "experimental",
      detail:
        "Default adapter registry with tree-sitter TS/JS and lightweight text Rust/Java/Python support.",
    });
    expect(
      capabilities.features.filter((feature) => feature.status === "stable"),
    ).toEqual([
      {
        name: "context-ir",
        status: "stable",
        detail: "Versioned ContextIR contract and provider formatter.",
      },
    ]);
  });

  it("runs bounded worker pool tasks with explicit queue limits", async () => {
    const pool = new BoundedContextWorkerPool({
      concurrency: 1,
      maxQueuedTasks: 1,
    });
    const first = createDeferred();
    const executionOrder: string[] = [];

    const firstTask = pool.enqueue(async () => {
      executionOrder.push("first:start");
      await first.promise;
      executionOrder.push("first:end");
    });
    const secondTask = pool.enqueue(async () => {
      executionOrder.push("second");
    });
    await expect(pool.enqueue(async () => undefined)).rejects.toThrow(
      "Context worker pool queue is full",
    );

    expect(pool.snapshot()).toEqual({
      runningTasks: 1,
      queuedTasks: 1,
      acceptedTasks: 2,
      rejectedTasks: 1,
      completedTasks: 0,
      failedTasks: 0,
      disposed: false,
    });

    first.resolve();
    await Promise.all([firstTask, secondTask]);

    expect(executionOrder).toEqual(["first:start", "first:end", "second"]);
    expect(pool.snapshot()).toEqual({
      runningTasks: 0,
      queuedTasks: 0,
      acceptedTasks: 2,
      rejectedTasks: 1,
      completedTasks: 2,
      failedTasks: 0,
      disposed: false,
    });
  });

  it("rejects queued and future worker pool tasks after dispose", async () => {
    const pool = new BoundedContextWorkerPool({
      concurrency: 1,
      maxQueuedTasks: 1,
    });
    const first = createDeferred();
    const firstTask = pool.enqueue(async () => {
      await first.promise;
    });
    const queuedTask = pool.enqueue(async () => undefined);
    const queuedExpectation = expect(queuedTask).rejects.toThrow(
      "Context worker pool is disposed",
    );

    pool.dispose();

    await queuedExpectation;
    await expect(pool.enqueue(async () => undefined)).rejects.toThrow(
      "Context worker pool is disposed",
    );
    first.resolve();
    await firstTask;
    expect(pool.snapshot()).toEqual({
      runningTasks: 0,
      queuedTasks: 0,
      acceptedTasks: 2,
      rejectedTasks: 2,
      completedTasks: 1,
      failedTasks: 0,
      disposed: true,
    });
  });

  it("records failed worker pool tasks and continues draining queued work", async () => {
    const pool = new BoundedContextWorkerPool({
      concurrency: 1,
      maxQueuedTasks: 1,
    });
    const executionOrder: string[] = [];

    const failingTask = pool.enqueue(async () => {
      executionOrder.push("first");
      throw new Error("index failed");
    });
    const nextTask = pool.enqueue(async () => {
      executionOrder.push("second");
      return "indexed";
    });

    await expect(failingTask).rejects.toThrow("index failed");
    await expect(nextTask).resolves.toBe("indexed");
    expect(executionOrder).toEqual(["first", "second"]);
    expect(pool.snapshot()).toEqual({
      runningTasks: 0,
      queuedTasks: 0,
      acceptedTasks: 2,
      rejectedTasks: 0,
      completedTasks: 1,
      failedTasks: 1,
      disposed: false,
    });
  });

  it("schedules compiler indexing operations through the background indexer", async () => {
    const compiler = new FallbackContextCompiler();
    await compiler.initialize("/workspace");
    const indexer = new BackgroundContextIndexer(compiler, {
      workerPool: {
        concurrency: 1,
        maxQueuedTasks: 2,
      },
    });

    await expect(
      indexer.scheduleIndexWorkspace(createRequest().files),
    ).resolves.toEqual({
      indexedFiles: 2,
      indexedSymbols: 0,
    });
    await expect(
      indexer.scheduleUpdateFile({
        path: "/workspace/src/extra.ts",
        content: "export const extra = true;",
      }),
    ).resolves.toEqual({
      indexedFiles: 3,
      indexedSymbols: 0,
    });
    await expect(
      indexer.scheduleRemoveFile("/workspace/src/extra.ts"),
    ).resolves.toBeUndefined();

    expect(indexer.snapshot()).toEqual({
      workerPool: {
        runningTasks: 0,
        queuedTasks: 0,
        acceptedTasks: 3,
        rejectedTasks: 0,
        completedTasks: 3,
        failedTasks: 0,
        disposed: false,
      },
    });
  });

  it("creates compact debug snapshots without embedding source content", () => {
    const qualitySummary = summarizeContextQualityBenchmarks([
      {
        id: "login",
        result: benchmarkContextQuality({
          contextIr: createContextIr(),
          expectation: {
            requiredSymbols: ["login"],
            baselineTokens: 80,
          },
        }),
      },
    ]);
    const snapshot = createContextCompilerDebugSnapshot({
      contextIr: createContextIr(),
      capabilities: getContextCompilerCapabilities(),
      qualitySummary,
      workerPool: {
        runningTasks: 0,
        queuedTasks: 1,
        acceptedTasks: 2,
        rejectedTasks: 0,
        completedTasks: 1,
        failedTasks: 0,
        disposed: false,
      },
      maxItems: 2,
    });

    expect(snapshot.contextIrVersion).toBe("0.1");
    expect(snapshot.features).toContainEqual({
      name: "context-ir",
      status: "stable",
    });
    expect(snapshot.selectedFilesCount).toBe(2);
    expect(snapshot.selectedSymbolsCount).toBe(1);
    expect(snapshot.diagnosticsCount).toBe(2);
    expect(snapshot.omittedCount).toBe(1);
    expect(snapshot.topEvidence).toEqual([
      {
        id: "symbol-login",
        kind: "symbol",
        path: "/workspace/src/login.ts",
        score: 1,
        estimatedTokens: 10,
        mode: "source",
        reasonCodes: ["mentioned_symbol"],
      },
      {
        id: "/workspace/src/login.ts",
        kind: "file",
        path: "/workspace/src/login.ts",
        score: 1,
        estimatedTokens: 10,
        mode: "partial",
        reasonCodes: ["active_file"],
      },
    ]);
    expect(snapshot.workerPool?.queuedTasks).toBe(1);
    expect(snapshot.qualitySummary?.samplesCount).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain(
      "export function login() { return true; }",
    );
  });

  it("resolves supported and planned language adapters explicitly", () => {
    expect(getDefaultContextLanguageAdapters()).toContainEqual({
      languageId: "typescript",
      extensions: [".ts", ".tsx"],
      status: "supported",
      parser: "tree-sitter",
      detail:
        "Native TypeScript/TSX adapter backed by tree-sitter when available.",
    });

    expect(resolveContextLanguageAdapter("/workspace/src/login.ts")).toEqual({
      adapter: {
        languageId: "typescript",
        extensions: [".ts", ".tsx"],
        status: "supported",
        parser: "tree-sitter",
        detail:
          "Native TypeScript/TSX adapter backed by tree-sitter when available.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "typescript" }],
    });
    expect(resolveContextLanguageAdapter("/workspace/src/App.jsx")).toEqual({
      adapter: {
        languageId: "javascript",
        extensions: [".js", ".jsx", ".mjs", ".cjs"],
        status: "supported",
        parser: "tree-sitter",
        detail:
          "Native JavaScript/JSX adapter backed by tree-sitter when available.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "javascript" }],
    });
    expect(resolveContextLanguageAdapter("/workspace/src/Main.java")).toEqual({
      adapter: {
        languageId: "java",
        extensions: [".java"],
        status: "supported",
        parser: "text",
        detail:
          "Lightweight Java text adapter for class/interface/method symbols.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "java" }],
    });
    expect(resolveContextLanguageAdapter("/workspace/src/lib.rs")).toEqual({
      adapter: {
        languageId: "rust",
        extensions: [".rs"],
        status: "supported",
        parser: "text",
        detail:
          "Lightweight Rust text adapter for type, impl and function symbols.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "rust" }],
    });
    expect(
      resolveContextLanguageAdapter("/workspace/README", "python"),
    ).toEqual({
      adapter: {
        languageId: "python",
        extensions: [".py"],
        status: "supported",
        parser: "text",
        detail: "Lightweight Python text adapter for class/function symbols.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "python" }],
    });
    expect(
      resolveContextLanguageAdapter("/workspace/src/login.ts", "python"),
    ).toEqual({
      adapter: {
        languageId: "python",
        extensions: [".py"],
        status: "supported",
        parser: "text",
        detail: "Lightweight Python text adapter for class/function symbols.",
      },
      reasons: [{ code: "language_adapter_supported", detail: "python" }],
    });
    expect(resolveContextLanguageAdapter("/workspace/README")).toEqual({
      reasons: [{ code: "language_adapter_not_found" }],
    });
  });

  it("exports the cache strategy used by fallback cache keys", () => {
    expect(getContextCompilerCacheStrategy()).toEqual(
      CONTEXT_COMPILER_CACHE_STRATEGY,
    );
    expect(CONTEXT_COMPILER_CACHE_STRATEGY).toEqual({
      contentHashAlgorithm: "fnv1a32-utf16",
      parserVersion: "fallback-text-v1",
      strategyVersion: "fallback-score-v1",
    });
  });

  it("creates a persistable cache snapshot from workspace file metadata", () => {
    const snapshot = createContextCacheSnapshot([
      {
        path: "/workspace/src/login.ts",
        content:
          "import { createSession } from './session';\nexport function login() { return createSession(); }",
        language: "typescript",
      },
      {
        path: "/workspace/src/session.ts",
        content: "export function createSession() { return true; }",
        language: "typescript",
      },
    ]);

    expect(snapshot).toEqual({
      version: "0.1",
      strategy: CONTEXT_COMPILER_CACHE_STRATEGY,
      files: [
        {
          path: "/workspace/src/login.ts",
          contentHash: hashWorkspaceFileContent(
            "import { createSession } from './session';\nexport function login() { return createSession(); }",
          ),
          parserVersion: "fallback-text-v1",
          strategyVersion: "fallback-score-v1",
          language: "typescript",
          lastModified: undefined,
          estimatedTokens: 24,
        },
        {
          path: "/workspace/src/session.ts",
          contentHash: hashWorkspaceFileContent(
            "export function createSession() { return true; }",
          ),
          parserVersion: "fallback-text-v1",
          strategyVersion: "fallback-score-v1",
          language: "typescript",
          lastModified: undefined,
          estimatedTokens: 12,
        },
      ],
      graphEdges: [
        {
          from: "/workspace/src/login.ts",
          to: "./session",
          type: "import",
        },
      ],
    });
  });

  it("does not persist import graph edges from comments or string literals", () => {
    const graphEdges = createContextCacheGraphEdges([
      {
        path: "/workspace/src/login.ts",
        content: [
          "// import oldLogin from './old-login';",
          "/* export { legacy } from './legacy'; */",
          "const marker = '/* not a comment */';",
          "const text = \"require('./text-only')\";",
          "import { createSession } from './session';",
          "const logger = require('../logger');",
        ].join("\n"),
      },
    ]);

    expect(graphEdges).toEqual([
      {
        from: "/workspace/src/login.ts",
        to: "../logger",
        type: "import",
      },
      {
        from: "/workspace/src/login.ts",
        to: "./session",
        type: "import",
      },
    ]);
  });

  it("persists import graph edges from multiline import declarations", () => {
    const graphEdges = createContextCacheGraphEdges([
      {
        path: "/workspace/src/login.ts",
        content: [
          "import {",
          "  createSession,",
          "} from './session';",
          "export {",
          "  createAudit,",
          "} from './audit';",
        ].join("\n"),
      },
    ]);

    expect(graphEdges).toEqual([
      {
        from: "/workspace/src/login.ts",
        to: "./audit",
        type: "import",
      },
      {
        from: "/workspace/src/login.ts",
        to: "./session",
        type: "import",
      },
    ]);
  });

  it("creates deterministic workspace graph snapshots from cache metadata", () => {
    const graph = createContextGraphSnapshot({
      version: "0.1",
      strategy: CONTEXT_COMPILER_CACHE_STRATEGY,
      files: [
        {
          path: "/workspace/src/session.ts",
          contentHash: "b",
          parserVersion: "fallback-text-v1",
          strategyVersion: "fallback-score-v1",
          estimatedTokens: 4,
        },
        {
          path: "/workspace/src/login.ts",
          contentHash: "a",
          parserVersion: "fallback-text-v1",
          strategyVersion: "fallback-score-v1",
          estimatedTokens: 8,
        },
      ],
      graphEdges: [
        {
          from: "/workspace/src/login.ts",
          to: "/workspace/src/session.ts",
          type: "import",
        },
        {
          from: "/workspace/src/login.ts",
          to: "node:crypto",
          type: "import",
        },
      ],
    });

    expect(graph).toEqual({
      nodes: [
        {
          path: "/workspace/src/login.ts",
          imports: ["/workspace/src/session.ts", "node:crypto"],
          importedBy: [],
          symbols: [],
        },
        {
          path: "/workspace/src/session.ts",
          imports: [],
          importedBy: ["/workspace/src/login.ts"],
          symbols: [],
        },
      ],
      edges: [
        {
          from: "/workspace/src/login.ts",
          to: "/workspace/src/session.ts",
          type: "import",
        },
        {
          from: "/workspace/src/login.ts",
          to: "node:crypto",
          type: "import",
        },
      ],
      totalFiles: 2,
      totalImports: 2,
    });
  });

  it("formats compact provider context without debug score factors", () => {
    const formatted = formatContextIrForProvider(createContextIr());

    expect(formatted).toContain("# Workspace Context");
    expect(formatted).toContain("### function: login");
    expect(formatted).toContain("mentioned_symbol: login");
    expect(formatted).toContain("Type mismatch (error)");
    expect(formatted).toContain("Missing return");
    expect(formatted).toContain("Omitted items: 1");
    expect(formatted).toContain(
      "- Source: semantic symbols above; full file content omitted from provider context",
    );
    expect(formatted).not.toContain("scoreFactors");
  });

  it("prefers semantic symbol chunks over duplicate file content", () => {
    const formatted = formatContextIrForProvider(createContextIr());
    const duplicateSource = "export function login() { return true; }";

    expect(formatted.split(duplicateSource)).toHaveLength(2);
  });

  it("formats unspecified reasons and omits empty optional sections", () => {
    const withUnspecifiedReason = formatContextIrForProvider(
      createContextIr({
        context: {
          symbols: [],
          files: [
            {
              path: "/workspace/src/types.ts",
              score: 0.5,
              scoreFactors: [],
              includedMode: "metadata",
              reasons: [],
              estimatedTokens: 1,
            },
          ],
          summaries: [],
          diagnostics: [],
        },
        omitted: [],
      }),
    );
    const withoutEvidence = formatContextIrForProvider(
      createContextIr({
        context: {
          symbols: [],
          files: [],
          summaries: [],
          diagnostics: [],
        },
        omitted: [],
      }),
    );

    expect(withUnspecifiedReason).toContain("- Reasons: unspecified");
    expect(withoutEvidence).not.toContain("## Relevant Symbols");
    expect(withoutEvidence).not.toContain("## Relevant Files");
    expect(withoutEvidence).not.toContain("## Diagnostics");
    expect(withoutEvidence).not.toContain("## Omitted Context Summary");
  });

  it("indexes, updates, removes, and builds fallback ContextIR from plain files", async () => {
    const compiler = new FallbackContextCompiler();

    await compiler.initialize("/workspace");
    await expect(
      compiler.indexWorkspace(createRequest().files),
    ).resolves.toEqual({
      indexedFiles: 2,
      indexedSymbols: 0,
    });
    await expect(
      compiler.updateFile({
        path: "/workspace/src/extra.ts",
        content: "export const extra = true;",
      }),
    ).resolves.toEqual({
      indexedFiles: 3,
      indexedSymbols: 0,
    });
    await expect(
      compiler.removeFile("/workspace/src/extra.ts"),
    ).resolves.toBeUndefined();

    const contextIr = await compiler.buildContextIr(createRequest());

    expect(contextIr.workspace.root).toBe("/workspace");
    expect(contextIr.workspace.languageHints).toEqual(["typescript"]);
    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
    expect(contextIr.context.diagnostics).toHaveLength(1);
    expect(contextIr.metrics.contextValuePerToken).toBeGreaterThan(0);
  });

  it("formats fallback ContextIR with full file content when semantic chunks are unavailable", async () => {
    const compiler = new FallbackContextCompiler();
    const contextIr = await compiler.buildContextIr(createRequest());

    const formatted = formatContextIrForProvider(contextIr);

    expect(contextIr.context.symbols).toHaveLength(0);
    expect(formatted).toContain("## Relevant Files");
    expect(formatted).toContain("export function login() { return true; }");
    expect(formatted).not.toContain(
      "full file content omitted from provider context",
    );
  });

  it("extracts lightweight Python and Java symbols in the fallback compiler", async () => {
    const compiler = new FallbackContextCompiler();
    const files = [
      {
        path: "/workspace/src/auth.py",
        content:
          "class AuthService:\n    def login(self):\n        return True\n",
        language: "python",
      },
      {
        path: "/workspace/src/AuthService.java",
        content:
          "public class AuthService {\n  public boolean login() { return true; }\n}\n",
        language: "java",
      },
    ];

    await expect(compiler.indexWorkspace(files)).resolves.toEqual({
      indexedFiles: 2,
      indexedSymbols: 4,
    });

    const contextIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/auth.py",
        openFiles: ["/workspace/src/AuthService.java"],
        mentionedSymbols: ["login"],
        files,
      }),
    );

    expect(contextIr.context.symbols.map((symbol) => symbol.name)).toEqual([
      "login",
      "login",
    ]);
    expect(contextIr.context.symbols.map((symbol) => symbol.kind)).toEqual([
      "function",
      "method",
    ]);
    expect(contextIr.context.files.map((file) => file.includedMode)).toEqual([
      "metadata",
      "metadata",
    ]);
    expect(contextIr.metrics.selectedSymbolsCount).toBe(2);
    expect(contextIr.budget.estimatedTokens).toBe(
      contextIr.context.files.reduce(
        (total, file) => total + file.estimatedTokens,
        0,
      ) +
        contextIr.context.symbols.reduce(
          (total, symbol) => total + symbol.estimatedTokens,
          0,
        ),
    );
    expect(contextIr.budget.estimatedTokens).toBeLessThanOrEqual(
      contextIr.budget.maxTokens,
    );
    expect(formatContextIrForProvider(contextIr)).toContain(
      "full file content omitted from provider context",
    );
  });

  it("recognizes Python async functions and Java constructors in lightweight fallback symbols", async () => {
    const compiler = new FallbackContextCompiler();
    const files = [
      {
        path: "/workspace/src/auth.py",
        content:
          "class AuthService:\n    async def refresh(self):\n        return True\n",
        language: "python",
      },
      {
        path: "/workspace/src/AuthService.java",
        content:
          "public class AuthService {\n  public AuthService() {}\n  public boolean login() { return true; }\n  public AuthService createAuthService() { return new AuthService(); }\n}\n",
        language: "java",
      },
    ];

    await expect(compiler.indexWorkspace(files)).resolves.toEqual({
      indexedFiles: 2,
      indexedSymbols: 6,
    });

    const pythonIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/auth.py",
        openFiles: [],
        mentionedSymbols: [],
        files,
      }),
    );
    const javaIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/AuthService.java",
        openFiles: [],
        mentionedSymbols: [],
        files,
      }),
    );

    expect(pythonIr.context.symbols.map((symbol) => symbol.name)).toContain(
      "refresh",
    );
    expect(javaIr.context.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AuthService",
          kind: "constructor",
        }),
        expect.objectContaining({
          name: "login",
          kind: "method",
        }),
        expect.objectContaining({
          name: "createAuthService",
          kind: "method",
        }),
      ]),
    );
  });

  it("extracts lightweight Rust type, impl and function symbols", async () => {
    const compiler = new FallbackContextCompiler();
    const files = [
      {
        path: "/workspace/src/lib.rs",
        content: [
          "pub struct AuthService {",
          "    enabled: bool,",
          "}",
          "",
          "impl AuthService {",
          "    pub async fn login(&self) -> bool {",
          "        self.enabled",
          "    }",
          "}",
          "",
          "pub trait Login {",
          "    fn allowed(&self) -> bool;",
          "    fn configured(",
          "        &self,",
          "    ) -> bool;",
          "}",
          "",
          "pub enum AuthState {",
          "    Enabled,",
          "    Disabled,",
          "}",
          "",
          "pub fn create_service() -> AuthService {",
          "    AuthService { enabled: true }",
          "}",
          "",
          "pub fn first_statement() -> bool { let ok = true;",
          "    ok",
          "}",
        ].join("\n"),
        language: "rust",
      },
    ];

    await expect(compiler.indexWorkspace(files)).resolves.toEqual({
      indexedFiles: 1,
      indexedSymbols: 9,
    });

    const contextIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/lib.rs",
        openFiles: [],
        mentionedSymbols: ["login"],
        files,
        maxTokens: 1000,
      }),
    );
    const authServiceIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/lib.rs",
        openFiles: [],
        mentionedSymbols: ["AuthService"],
        files,
        maxTokens: 1000,
      }),
    );
    const traitIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/lib.rs",
        openFiles: [],
        mentionedSymbols: ["Login"],
        files,
        maxTokens: 1000,
      }),
    );
    const rangeIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/lib.rs",
        openFiles: [],
        mentionedSymbols: ["configured", "first_statement"],
        files,
        maxTokens: 1000,
      }),
    );

    expect(contextIr.context.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "login",
          kind: "function",
        }),
        expect.objectContaining({
          name: "AuthState",
          kind: "enum",
        }),
        expect.objectContaining({
          name: "create_service",
          kind: "function",
        }),
        expect.objectContaining({
          name: "first_statement",
          kind: "function",
        }),
      ]),
    );
    expect(authServiceIr.context.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AuthService",
          kind: "struct",
        }),
        expect.objectContaining({
          name: "AuthService",
          kind: "impl",
        }),
      ]),
    );
    expect(traitIr.context.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Login",
          kind: "trait",
        }),
      ]),
    );
    expect(
      rangeIr.context.symbols.find(
        (symbol) => symbol.name === "configured",
      )?.range,
    ).toEqual({
      startLine: 13,
      endLine: 15,
    });
    expect(
      rangeIr.context.symbols.find(
        (symbol) => symbol.name === "first_statement",
      )?.range,
    ).toEqual({
      startLine: 27,
      endLine: 29,
    });
    expect(contextIr.context.files.map((file) => file.includedMode)).toEqual([
      "metadata",
    ]);
    expect(contextIr.budget.estimatedTokens).toBeLessThanOrEqual(
      contextIr.budget.maxTokens,
    );
  });

  it("keeps mentioned lightweight container symbols without duplicating nested source", async () => {
    const compiler = new FallbackContextCompiler();
    const files = [
      {
        path: "/workspace/src/auth.py",
        content:
          "class AuthService:\n    def login(self):\n        return True\n",
        language: "python",
      },
    ];

    const contextIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/auth.py",
        openFiles: [],
        mentionedSymbols: ["AuthService"],
        files,
      }),
    );

    expect(contextIr.context.symbols.map((symbol) => symbol.name)).toEqual([
      "AuthService",
    ]);
    expect(contextIr.budget.estimatedTokens).toBeLessThanOrEqual(
      contextIr.budget.maxTokens,
    );
  });

  it("drops lower-priority lightweight symbols when per-symbol rounding exceeds budget", async () => {
    const compiler = new FallbackContextCompiler();
    const content = "def a():\n    x\ndef b():\n    yyy\n";
    const files = [
      {
        path: "/workspace/src/auth.py",
        content,
        language: "python",
      },
    ];

    const contextIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/auth.py",
        openFiles: [],
        files,
        maxTokens: Math.ceil(content.length / 4),
      }),
    );

    expect(contextIr.context.symbols.map((symbol) => symbol.name)).toEqual([
      "a",
    ]);
    expect(contextIr.budget.estimatedTokens).toBeLessThanOrEqual(
      contextIr.budget.maxTokens,
    );
  });

  it("reports fallback cache hit ratio from indexed file content hashes", async () => {
    const compiler = new FallbackContextCompiler();
    const request = createRequest();
    await compiler.initialize("/workspace");
    await compiler.indexWorkspace(request.files);

    const cachedContextIr = await compiler.buildContextIr(request);
    const partiallyChangedContextIr = await compiler.buildContextIr(
      createRequest({
        files: [
          {
            path: "/workspace/src/login.ts",
            content: "export function login() { return false; }",
            language: "typescript",
          },
          {
            path: "/workspace/src/session.ts",
            content: "export function createSession() { return true; }",
            language: "typescript",
          },
        ],
      }),
    );

    expect(cachedContextIr.metrics.cacheHitRatio).toBe(1);
    expect(partiallyChangedContextIr.metrics.cacheHitRatio).toBe(0.5);
  });

  it("keeps fallback cache hits stable for indexed files reused by request", async () => {
    const compiler = new FallbackContextCompiler();
    const request = createRequest();
    await compiler.indexWorkspace(request.files);

    const contextIr = await compiler.buildContextIr({
      ...request,
      files: [],
    });

    expect(contextIr.metrics.cacheHitRatio).toBe(1);
  });

  it("persists fallback cache metadata to SQLite and warms a new compiler instance", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const request = createRequest();
      const coldCompiler = new FallbackContextCompiler();
      await coldCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await coldCompiler.indexWorkspace(request.files);

      const warmCompiler = new FallbackContextCompiler();
      await warmCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      const warmContextIr = await warmCompiler.buildContextIr(request);
      const partiallyChangedContextIr = await warmCompiler.buildContextIr(
        createRequest({
          files: [
            {
              path: "/workspace/src/login.ts",
              content: "export function login() { return false; }",
              language: "typescript",
            },
            request.files[1],
          ],
        }),
      );

      expect(warmContextIr.metrics.cacheHitRatio).toBe(1);
      expect(partiallyChangedContextIr.metrics.cacheHitRatio).toBe(0.5);
      coldCompiler.dispose();
      warmCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists fallback import graph edges in the SQLite cache snapshot", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const files = [
        {
          path: "/workspace/src/login.ts",
          content:
            "import { createSession } from './session';\nconst logger = require('../logger');",
          language: "typescript",
        },
      ];
      const coldCompiler = new FallbackContextCompiler();
      await coldCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await coldCompiler.indexWorkspace(files);
      coldCompiler.dispose();

      const warmCompiler = new FallbackContextCompiler();
      await warmCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      const snapshot = warmCompiler.getCacheSnapshot();

      expect(snapshot?.graphEdges).toEqual([
        {
          from: "/workspace/src/login.ts",
          to: "../logger",
          type: "import",
        },
        {
          from: "/workspace/src/login.ts",
          to: "./session",
          type: "import",
        },
      ]);
      warmCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists fallback source-hashed summaries in the SQLite cache snapshot", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const content = Array.from(
        { length: 30 },
        (_, index) => `export const value${index} = ${index};`,
      ).join("\n");
      const expectedSummary = Array.from(
        { length: 5 },
        (_, index) => `export const value${index} = ${index};`,
      ).join("\n");
      const expectedCachedSummaries = [
        {
          id: "summary:/workspace/src/large.ts",
          kind: "file" as const,
          path: "/workspace/src/large.ts",
          sourceHash: hashWorkspaceFileContent(content),
          summary: expectedSummary,
          estimatedTokens: Math.ceil(expectedSummary.length / 4),
          reasonCodes: ["budget_summary"],
        },
      ];
      const compiler = new FallbackContextCompiler();
      await compiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await compiler.indexWorkspace([
        {
          path: "/workspace/src/large.ts",
          content,
          language: "typescript",
        },
      ]);
      await compiler.buildContextIr({
        ...createRequest(),
        activeFile: "/workspace/src/large.ts",
        maxTokens: 40,
        files: [],
      });
      compiler.dispose();

      const warmCompiler = new FallbackContextCompiler();
      await warmCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      expect(warmCompiler.getCacheSnapshot()?.summaries).toEqual(
        expectedCachedSummaries,
      );
      await warmCompiler.indexWorkspace([
        {
          path: "/workspace/src/large.ts",
          content,
          language: "typescript",
        },
      ]);
      expect(warmCompiler.getCacheSnapshot()?.summaries).toEqual(
        expectedCachedSummaries,
      );
      await warmCompiler.updateFile({
        path: "/workspace/src/large.ts",
        content: "export const value0 = 0;",
        language: "typescript",
      });
      expect(warmCompiler.getCacheSnapshot()?.summaries).toEqual([]);
      warmCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves warm SQLite snapshot entries during incremental updates and removes", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const initialFiles = [
        {
          path: "/workspace/src/login.ts",
          content: "import { createSession } from './session';",
          language: "typescript",
        },
        {
          path: "/workspace/src/session.ts",
          content: "import { randomUUID } from 'node:crypto';",
          language: "typescript",
        },
      ];
      const coldCompiler = new FallbackContextCompiler();
      await coldCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await coldCompiler.indexWorkspace(initialFiles);
      coldCompiler.dispose();

      const warmCompiler = new FallbackContextCompiler();
      await warmCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await warmCompiler.updateFile({
        path: "/workspace/src/login.ts",
        content: "import { authorize } from './auth';",
        language: "typescript",
      });
      await warmCompiler.removeFile("/workspace/src/login.ts");
      warmCompiler.dispose();

      const reloadedCompiler = new FallbackContextCompiler();
      await reloadedCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      expect(
        reloadedCompiler.getCacheSnapshot()?.files.map((file) => file.path),
      ).toEqual(["/workspace/src/session.ts"]);
      expect(reloadedCompiler.getCacheSnapshot()?.graphEdges).toEqual([
        {
          from: "/workspace/src/session.ts",
          to: "node:crypto",
          type: "import",
        },
      ]);
      reloadedCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("clears fallback in-memory files and cache when initialized for another root", async () => {
    const compiler = new FallbackContextCompiler();
    await compiler.initialize("/workspace-a");
    await compiler.indexWorkspace(createRequest().files);
    await compiler.initialize("/workspace-b");

    const contextIr = await compiler.buildContextIr(
      createRequest({
        workspaceRoot: "",
        activeFile: undefined,
        openFiles: [],
        changedFiles: [],
        files: [],
      }),
    );

    expect(contextIr.workspace.root).toBe("/workspace-b");
    expect(contextIr.context.files).toHaveLength(0);
    expect(contextIr.metrics.cacheHitRatio).toBe(0);
  });

  it("uses indexed files and reports changed-file reasons when request files are empty", async () => {
    const compiler = new FallbackContextCompiler();
    await compiler.initialize("/workspace");
    await compiler.indexWorkspace(createRequest().files);

    const contextIr = await compiler.buildContextIr(
      createRequest({
        files: [],
        openFiles: [],
        changedFiles: ["/workspace/src/login.ts"],
      }),
    );

    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
    expect(
      contextIr.context.files[0]?.reasons.map((entry) => entry.code),
    ).toEqual(["active_file", "changed_file"]);
  });

  it("orders selected files by context score before applying the budget", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        activeFile: "/workspace/src/session.ts",
        openFiles: ["/workspace/src/login.ts", "/workspace/src/session.ts"],
        changedFiles: ["/workspace/src/login.ts"],
      }),
    );

    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/session.ts",
      "/workspace/src/login.ts",
    ]);
  });

  it("selects direct dependencies resolved through tsconfig path aliases", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        files: [
          {
            path: "/workspace/src/login.ts",
            content:
              "import { createSession } from '@app/session';\nexport function login() { return createSession(); }",
            language: "typescript",
          },
          {
            path: "/workspace/src/session.ts",
            content: "export function createSession() { return true; }",
            language: "typescript",
          },
          {
            path: "/workspace/tsconfig.json",
            content: JSON.stringify({
              compilerOptions: {
                baseUrl: ".",
                paths: {
                  "@app/*": ["src/*"],
                },
              },
            }),
            language: "json",
          },
        ],
      }),
    );

    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/login.ts",
      "/workspace/src/session.ts",
    ]);
    expect(
      contextIr.context.files[1]?.reasons.map((entry) => entry.code),
    ).toEqual(["direct_dependency"]);
    expect(
      contextIr.context.files[1]?.scoreFactors.find(
        (factor) => factor.name === "dependency_proximity",
      ),
    ).toMatchObject({
      value: 1,
      contribution: 0.4,
    });
  });

  it("resolves tsconfig path aliases for relative workspace paths", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        workspaceRoot: "",
        activeFile: "src/login.ts",
        openFiles: ["src/login.ts"],
        files: [
          {
            path: "src/login.ts",
            content:
              "import { createSession } from '@app/session';\nexport function login() { return createSession(); }",
            language: "typescript",
          },
          {
            path: "src/session.ts",
            content: "export function createSession() { return true; }",
            language: "typescript",
          },
          {
            path: "tsconfig.json",
            content: JSON.stringify({
              compilerOptions: {
                baseUrl: ".",
                paths: {
                  "@app/*": ["src/*"],
                },
              },
            }),
          },
        ],
      }),
    );

    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "src/login.ts",
      "src/session.ts",
    ]);
  });

  it("does not prefix-match exact tsconfig path aliases", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        files: [
          {
            path: "/workspace/src/login.ts",
            content:
              "import { createSession } from '@app/session/extra';\nexport function login() { return createSession(); }",
            language: "typescript",
          },
          {
            path: "/workspace/src/session.ts",
            content: "export function createSession() { return true; }",
            language: "typescript",
          },
          {
            path: "/workspace/tsconfig.json",
            content: JSON.stringify({
              compilerOptions: {
                baseUrl: ".",
                paths: {
                  "@app/session": ["src/session"],
                },
              },
            }),
          },
        ],
      }),
    );

    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
  });

  it("normalizes legacy selection priority in score factors", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        files: [
          {
            path: "/workspace/src/login.ts",
            content: "export function login() { return true; }",
            selectionPriority: 10,
          },
        ],
      }),
    );
    const priorityFactor = contextIr.context.files[0]?.scoreFactors.find(
      (factor) => factor.name === "legacy_context_priority",
    );

    expect(priorityFactor).toMatchObject({
      value: 1,
      contribution: 1,
    });
    expect(contextIr.context.files[0]?.score).toBe(11.5);
  });

  it("omits over-budget files and explains the same selection path", async () => {
    const compiler = new FallbackContextCompiler();

    const contextIr = await compiler.buildContextIr(
      createRequest({
        maxTokens: 1,
      }),
    );
    const explanation = await compiler.explainSelection(
      createRequest({
        maxTokens: 1,
      }),
    );

    expect(contextIr.context.files).toHaveLength(0);
    expect(contextIr.omitted).toEqual([
      {
        id: "/workspace/src/login.ts",
        kind: "file",
        path: "/workspace/src/login.ts",
        score: 1.5,
        reason: "budget_exceeded",
      },
    ]);
    expect(explanation.selectedFiles).toHaveLength(0);
    expect(explanation.selectedSymbols).toHaveLength(0);
    expect(explanation.omitted).toHaveLength(1);
  });

  it("adds source-hashed summaries for relevant files that exceed the token budget", async () => {
    const compiler = new FallbackContextCompiler();
    const summaryLines = [
      "export function login() {",
      "return createSession();",
      "}",
      "export const status = true;",
      "export const scope = 'auth';",
    ];
    const largeContent = [
      ...summaryLines,
      `const filler = "${"x".repeat(400)}";`,
    ].join("\n");

    const contextIr = await compiler.buildContextIr(
      createRequest({
        maxTokens: 30,
        files: [
          {
            path: "/workspace/src/login.ts",
            content: largeContent,
            language: "typescript",
          },
        ],
      }),
    );
    const formatted = formatContextIrForProvider(contextIr);

    expect(contextIr.context.files).toHaveLength(0);
    expect(contextIr.omitted[0]?.reason).toBe("budget_exceeded");
    expect(contextIr.context.summaries).toEqual([
      {
        id: "summary:/workspace/src/login.ts",
        kind: "file",
        path: "/workspace/src/login.ts",
        sourceHash: hashWorkspaceFileContent(largeContent),
        summary: summaryLines.join("\n"),
        estimatedTokens: Math.ceil(summaryLines.join("\n").length / 4),
        reasons: [{ code: "budget_summary" }],
      },
    ]);
    expect(formatted).toContain("## Summary Context");
    expect(formatted).toContain("- Reasons: budget_summary");
  });

  it("compresses long tool output around errors, stack traces, and tail context", () => {
    const output = [
      ...Array.from({ length: 80 }, (_value, index) => `info line ${index}`),
      "Error: build failed",
      "    at compile (/workspace/src/build.ts:10:3)",
      "    at main (/workspace/src/build.ts:20:1)",
      ...Array.from({ length: 10 }, (_value, index) => `tail line ${index}`),
    ].join("\n");

    const result = optimizeToolOutput({
      output,
      maxCharacters: 220,
      command: "pnpm run compile",
      diagnostics: [
        {
          path: "/workspace/src/build.ts",
          message: "Type mismatch",
          severity: "error",
        },
      ],
    });

    expect(result.optimizedCharacters).toBeLessThanOrEqual(220);
    expect(result.omittedCharacters).toBeGreaterThan(0);
    expect(result.omittedLines).toBeGreaterThan(0);
    expect(result.optimizedOutput).toContain("Error: build failed");
    expect(result.optimizedOutput).toContain("at compile");
    expect(result.optimizedOutput).toContain("tail line");
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "terminal_output_compressed",
      "error_lines_prioritized",
      "tail_context_retained",
      "diagnostics_available",
    ]);
  });

  it("returns short tool output unchanged", () => {
    const result = optimizeToolOutput({
      output: "ok",
      maxCharacters: 20,
    });

    expect(result).toEqual({
      optimizedOutput: "ok",
      originalCharacters: 2,
      optimizedCharacters: 2,
      omittedCharacters: 0,
      omittedLines: 0,
      reasons: [],
    });
  });

  it("builds a minimal KORIX patch window for changed content", () => {
    const result = optimizeReplacementPatch({
      path: "src/login.ts",
      originalContent: [
        "import { session } from './session';",
        "",
        "export function login() {",
        "  return false;",
        "}",
        "",
        "export const done = true;",
      ].join("\n"),
      modifiedContent: [
        "import { session } from './session';",
        "",
        "export function login() {",
        "  return session();",
        "}",
        "",
        "export const done = true;",
      ].join("\n"),
      contextLines: 1,
    });

    expect(result.changed).toBe(true);
    expect(result.search).toBe(
      ["export function login() {", "  return false;", "}"].join("\n"),
    );
    expect(result.replace).toBe(
      ["export function login() {", "  return session();", "}"].join("\n"),
    );
    expect(result.patch).toContain('<KORIX_PATCH file="src/login.ts">');
    expect(result.patchCharacters).toBe(result.patch?.length);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "minimal_replacement_window",
      "context_lines_retained",
    ]);
  });

  it("does not build a patch when content is unchanged", () => {
    const result = optimizeReplacementPatch({
      path: "src/login.ts",
      originalContent: "export const ok = true;",
      modifiedContent: "export const ok = true;",
    });

    expect(result).toEqual({
      changed: false,
      originalCharacters: 23,
      patchCharacters: 0,
      reasons: [],
    });
  });

  it("anchors pure insertions when zero context lines are requested", () => {
    const result = optimizeReplacementPatch({
      path: "src/login.ts",
      originalContent: "a\nc",
      modifiedContent: "a\nb\nc",
      contextLines: 0,
    });

    expect(result.search).toBe("a");
    expect(result.replace).toBe("a\nb");
    expect(result.patch).toContain("<SEARCH>\na\n</SEARCH>");
  });

  it("builds a patch window for deletions", () => {
    const result = optimizeReplacementPatch({
      path: "src/login.ts",
      originalContent: "a\nb\nc",
      modifiedContent: "a\nc",
      contextLines: 0,
    });

    expect(result.search).toBe("b");
    expect(result.replace).toBe("");
    expect(result.patch).toContain("<REPLACE>\n\n</REPLACE>");
  });

  it("does not emit an invalid empty-search patch for empty original content", () => {
    const result = optimizeReplacementPatch({
      path: "src/login.ts",
      originalContent: "",
      modifiedContent: "a",
      contextLines: 0,
    });

    expect(result).toEqual({
      changed: true,
      originalCharacters: 0,
      patchCharacters: 0,
      reasons: [{ code: "patch_anchor_unavailable" }],
    });
  });

  it("ranks externally supplied embedding candidates without owning embeddings storage", () => {
    const matches = rankEmbeddingFallback({
      queryVector: [1, 0],
      candidates: [
        {
          id: "far",
          path: "/workspace/src/far.ts",
          vector: [0, 1],
        },
        {
          id: "near",
          path: "/workspace/src/near.ts",
          vector: [0.9, 0.1],
          metadata: "auth",
        },
        {
          id: "invalid-dimension",
          vector: [1, 0, 0],
        },
      ],
      minScore: 0.5,
      maxResults: 1,
    });

    expect(matches).toEqual([
      {
        id: "near",
        path: "/workspace/src/near.ts",
        score: 0.9938837346736189,
        metadata: "auth",
        reasons: [{ code: "embedding_similarity" }],
      },
    ]);
  });

  it("returns no embedding fallback matches for zero result budget", () => {
    const matches = rankEmbeddingFallback({
      queryVector: [1],
      candidates: [
        {
          id: "candidate",
          vector: [1],
        },
      ],
      maxResults: 0,
    });

    expect(matches).toEqual([]);
  });

  it("skips non-finite and zero embedding vectors", () => {
    const matches = rankEmbeddingFallback({
      queryVector: [1, 0],
      candidates: [
        {
          id: "nan",
          vector: [Number.NaN, 0],
        },
        {
          id: "infinity",
          vector: [Number.POSITIVE_INFINITY, 0],
        },
        {
          id: "zero",
          vector: [0, 0],
        },
        {
          id: "valid",
          vector: [1, 0],
        },
      ],
    });

    expect(matches.map((match) => match.id)).toEqual(["valid"]);
    expect(matches[0]?.score).toBe(1);
  });

  it("benchmarks context quality by retained evidence and token savings", () => {
    const result = benchmarkContextQuality({
      contextIr: createContextIr(),
      expectation: {
        requiredFiles: ["/workspace/src/login.ts"],
        requiredSymbols: ["login"],
        requiredDiagnostics: [
          {
            path: "/workspace/src/login.ts",
            messageIncludes: "Type mismatch",
            severity: "error",
          },
        ],
        baselineTokens: 80,
        minTokenSavingsPercent: 70,
        minContextValuePerToken: 0.1,
      },
    });

    expect(result).toEqual({
      passed: true,
      compiledTokens: 20,
      baselineTokens: 80,
      tokenSavingsPercent: 75,
      expectedEvidenceCount: 3,
      matchedEvidenceCount: 3,
      evidenceCoveragePercent: 100,
      contextValuePerToken: 0.15,
      missingEvidence: [],
      reasons: [
        { code: "quality_benchmark_passed" },
        { code: "required_evidence_checked", detail: "3/3" },
      ],
    });
  });

  it("reports missing benchmark evidence and failed quality thresholds", () => {
    const result = benchmarkContextQuality({
      contextIr: createContextIr(),
      expectation: {
        requiredFiles: ["/workspace/src/missing.ts"],
        requiredSymbols: ["missingSymbol"],
        requiredDiagnostics: [
          {
            path: "/workspace/src/session.ts",
            messageIncludes: "Different error",
          },
        ],
        baselineTokens: 40,
        minTokenSavingsPercent: 60,
        minContextValuePerToken: 0.1,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.tokenSavingsPercent).toBe(50);
    expect(result.evidenceCoveragePercent).toBe(0);
    expect(result.contextValuePerToken).toBe(0);
    expect(result.missingEvidence).toEqual([
      { kind: "file", id: "/workspace/src/missing.ts" },
      { kind: "symbol", id: "missingSymbol" },
      {
        kind: "diagnostic",
        id: "/workspace/src/session.ts:*:Different error",
      },
      {
        kind: "metric",
        id: "tokenSavingsPercent",
        detail: "50 < 60",
      },
      {
        kind: "metric",
        id: "contextValuePerToken",
        detail: "0 < 0.1",
      },
    ]);
    expect(result.reasons).toEqual([
      { code: "quality_benchmark_failed" },
      { code: "required_evidence_checked", detail: "0/3" },
    ]);
  });

  it("summarizes quality benchmark outcomes across samples", () => {
    const passingResult = benchmarkContextQuality({
      contextIr: createContextIr(),
      expectation: {
        requiredFiles: ["/workspace/src/login.ts"],
        baselineTokens: 80,
      },
    });
    const failingResult = benchmarkContextQuality({
      contextIr: createContextIr(),
      expectation: {
        requiredFiles: ["/workspace/src/missing.ts"],
        baselineTokens: 40,
      },
    });

    const summary = summarizeContextQualityBenchmarks([
      {
        id: "login-patch",
        result: passingResult,
        baselinePatchAccepted: false,
        compiledPatchAccepted: true,
        baselineTaskCompleted: false,
        compiledTaskCompleted: true,
      },
      {
        id: "missing-context",
        result: failingResult,
        baselinePatchAccepted: true,
        compiledPatchAccepted: true,
        baselineTaskCompleted: true,
        compiledTaskCompleted: false,
      },
    ]);

    expect(summary).toEqual({
      samplesCount: 2,
      passedSamplesCount: 1,
      failedSamplesCount: 1,
      averageTokenSavingsPercent: 62.5,
      averageEvidenceCoveragePercent: 50,
      averageContextValuePerToken: 0.025,
      patchOutcomeSamplesCount: 2,
      baselinePatchAcceptRatePercent: 50,
      compiledPatchAcceptRatePercent: 100,
      patchAcceptRateDeltaPercent: 50,
      taskOutcomeSamplesCount: 2,
      baselineTaskCompletionRatePercent: 50,
      compiledTaskCompletionRatePercent: 50,
      taskCompletionRateDeltaPercent: 0,
      reasons: [{ code: "quality_benchmark_summary_computed" }],
    });
  });

  it("runs quality benchmark fixtures as an aggregate pass/fail gate", () => {
    const report = runContextQualityBenchmarkFixtures([
      {
        id: "login-context",
        contextIr: createContextIr(),
        expectation: {
          requiredFiles: ["/workspace/src/login.ts"],
          requiredSymbols: ["login"],
          requiredDiagnostics: [
            {
              path: "/workspace/src/login.ts",
              messageIncludes: "Type mismatch",
              severity: "error",
            },
          ],
          baselineTokens: 80,
          minTokenSavingsPercent: 70,
          minContextValuePerToken: 0.1,
        },
        baselineOutcome: {
          patchAccepted: false,
          taskCompleted: false,
        },
        compiledOutcome: {
          patchAccepted: true,
          taskCompleted: true,
        },
      },
    ]);

    expect(report.passed).toBe(true);
    expect(report.failedFixtureIds).toEqual([]);
    expect(report.reasons).toEqual([
      { code: "quality_benchmark_fixtures_passed" },
    ]);
    expect(report.summary).toMatchObject({
      samplesCount: 1,
      passedSamplesCount: 1,
      failedSamplesCount: 0,
      patchAcceptRateDeltaPercent: 100,
      taskCompletionRateDeltaPercent: 100,
    });
  });

  it("reports failing or empty quality benchmark fixture sets explicitly", () => {
    const failingReport = runContextQualityBenchmarkFixtures([
      {
        id: "missing-critical-evidence",
        contextIr: createContextIr(),
        expectation: {
          requiredFiles: ["/workspace/src/missing.ts"],
        },
      },
    ]);
    const emptyReport = runContextQualityBenchmarkFixtures([]);

    expect(failingReport.passed).toBe(false);
    expect(failingReport.failedFixtureIds).toEqual([
      "missing-critical-evidence",
    ]);
    expect(failingReport.reasons).toEqual([
      {
        code: "quality_benchmark_fixtures_failed",
        detail: "missing-critical-evidence",
      },
    ]);
    expect(emptyReport.passed).toBe(false);
    expect(emptyReport.reasons).toEqual([
      { code: "quality_benchmark_fixtures_empty" },
    ]);
  });

  it("creates quality telemetry samples only from observed runtime outcomes", () => {
    const sample = createContextQualityTelemetrySample({
      id: "login-runtime",
      contextIr: createContextIr(),
      expectation: {
        requiredSymbols: ["login"],
        baselineTokens: 80,
      },
      compiledOutcome: {
        patchAccepted: true,
        taskCompleted: false,
      },
    });

    expect(sample).toMatchObject({
      id: "login-runtime",
      baselinePatchAccepted: undefined,
      compiledPatchAccepted: true,
      baselineTaskCompleted: undefined,
      compiledTaskCompleted: false,
    });
    expect(sample.result.passed).toBe(true);
  });

  it("buffers context quality telemetry and summarizes paired outcomes", () => {
    const buffer = new ContextQualityTelemetryBuffer();

    buffer.record({
      id: "baseline-wins",
      contextIr: createContextIr(),
      baselineOutcome: {
        patchAccepted: true,
        taskCompleted: false,
      },
      compiledOutcome: {
        patchAccepted: false,
        taskCompleted: true,
      },
    });
    buffer.record({
      id: "compiled-only-unpaired-baseline",
      contextIr: createContextIr(),
      compiledOutcome: {
        patchAccepted: true,
      },
    });

    expect(buffer.samples()).toHaveLength(2);
    expect(buffer.summarize()).toMatchObject({
      samplesCount: 2,
      patchOutcomeSamplesCount: 1,
      baselinePatchAcceptRatePercent: 100,
      compiledPatchAcceptRatePercent: 0,
      taskOutcomeSamplesCount: 1,
      baselineTaskCompletionRatePercent: 0,
      compiledTaskCompletionRatePercent: 100,
    });

    buffer.clear();
    expect(buffer.samples()).toEqual([]);
    expect(buffer.summarize().reasons).toEqual([
      { code: "quality_benchmark_summary_empty" },
    ]);
  });

  it("returns an empty benchmark summary when no samples are available", () => {
    expect(summarizeContextQualityBenchmarks([])).toEqual({
      samplesCount: 0,
      passedSamplesCount: 0,
      failedSamplesCount: 0,
      averageTokenSavingsPercent: 0,
      averageEvidenceCoveragePercent: 0,
      averageContextValuePerToken: 0,
      patchOutcomeSamplesCount: 0,
      baselinePatchAcceptRatePercent: 0,
      compiledPatchAcceptRatePercent: 0,
      patchAcceptRateDeltaPercent: 0,
      taskOutcomeSamplesCount: 0,
      baselineTaskCompletionRatePercent: 0,
      compiledTaskCompletionRatePercent: 0,
      taskCompletionRateDeltaPercent: 0,
      reasons: [{ code: "quality_benchmark_summary_empty" }],
    });
  });

  it("returns zero savings and value when no files are available", async () => {
    const compiler = new FallbackContextCompiler();
    await compiler.initialize("/indexed-root");

    const contextIr = await compiler.buildContextIr(
      createRequest({
        workspaceRoot: "",
        activeFile: undefined,
        openFiles: [],
        changedFiles: [],
        diagnostics: [],
        files: [],
      }),
    );

    expect(contextIr.workspace.root).toBe("/indexed-root");
    expect(contextIr.budget.tokensBeforeOptimization).toBe(0);
    expect(contextIr.metrics.tokenSavingsPercent).toBe(0);
    expect(contextIr.metrics.contextValuePerToken).toBe(0);
  });
});
