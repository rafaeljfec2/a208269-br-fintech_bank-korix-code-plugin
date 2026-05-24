import { beforeAll, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "../contextEngine";
import { initializeLogger } from "../../telemetry/logger";
import type { ContextWindow } from "../types";
import type {
  BuildContextIrRequest,
  ContextCompiler,
  ContextIR,
  ContextSelectionExplanation,
  IndexSummary,
  WorkspaceFileInput,
} from "@korix/context-compiler";

interface WorkspaceIndexerEventHooks {
  readonly onFileIndexed?: (file: WorkspaceFileInput) => void;
  readonly onFileDeleted?: (path: string) => void;
}

interface WorkspaceIndexerWithEvents {
  readonly events: WorkspaceIndexerEventHooks;
}

function createContextWindow(): ContextWindow {
  return {
    items: [
      {
        file: "/workspace/src/login.ts",
        content: "export function login() { return true; }",
        priority: 10,
        tokenCount: 10,
      },
    ],
    totalTokens: 10,
    budget: 100,
  };
}

function createContextIr(): ContextIR {
  return {
    version: "0.1",
    task: {
      userPrompt: "fix login",
      activeFile: "/workspace/src/login.ts",
      mentionedSymbols: [],
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
      estimatedTokens: 10,
      tokensBeforeOptimization: 10,
    },
    context: {
      symbols: [],
      files: [
        {
          path: "/workspace/src/login.ts",
          score: 10,
          scoreFactors: [],
          includedMode: "full",
          reasons: [{ code: "test_compiler" }],
          estimatedTokens: 10,
          content: "export function login() { return true; }",
        },
      ],
      summaries: [],
      diagnostics: [],
    },
    omitted: [],
    metrics: {
      contextBuildLatencyMs: 1,
      selectedFilesCount: 1,
      selectedSymbolsCount: 0,
      selectedDiagnosticsCount: 0,
      selectedRelevantSymbolsCount: 0,
      legacyBaselineTokens: 10,
      tokenSavingsPercent: 0,
      contextValuePerToken: 0.1,
      cacheHitRatio: 0,
    },
  };
}

function createCompiler(contextIr = createContextIr()): ContextCompiler {
  return {
    initialize: vi.fn((_root: string) => Promise.resolve()),
    indexWorkspace: vi.fn(
      (_files: readonly WorkspaceFileInput[]): Promise<IndexSummary> =>
        Promise.resolve({
          indexedFiles: 1,
          indexedSymbols: 0,
        }),
    ),
    updateFile: vi.fn(
      (_file: WorkspaceFileInput): Promise<IndexSummary> =>
        Promise.resolve({
          indexedFiles: 1,
          indexedSymbols: 0,
        }),
    ),
    removeFile: vi.fn((_path: string) => Promise.resolve()),
    buildContextIr: vi.fn((_request: BuildContextIrRequest) =>
      Promise.resolve(contextIr),
    ),
    explainSelection: vi.fn(
      (_request: BuildContextIrRequest): Promise<ContextSelectionExplanation> =>
        Promise.resolve({
          selectedFiles: contextIr.context.files,
          selectedSymbols: contextIr.context.symbols,
          omitted: contextIr.omitted,
          metrics: contextIr.metrics,
        }),
    ),
    dispose: vi.fn(),
  };
}

describe("ContextEngine compiler facade", () => {
  beforeAll(() => {
    initializeLogger({ level: "error" });
  });

  it("delegates ContextIR builds to the context compiler package", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler);
    vi.spyOn(engine, "buildContext").mockResolvedValue(createContextWindow());

    const contextIr = await engine.buildContextIr({
      userPrompt: "fix login",
      currentFile: "/workspace/src/login.ts",
      workspaceRoot: "/workspace",
      openFiles: ["/workspace/src/login.ts"],
      tokenBudget: 100,
    });

    expect(compiler.initialize).toHaveBeenCalledWith("/workspace");
    expect(compiler.indexWorkspace).toHaveBeenCalledWith([
      {
        path: "/workspace/src/login.ts",
        content: "export function login() { return true; }",
        selectionPriority: 10,
      },
    ]);
    expect(compiler.buildContextIr).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: "fix login",
        workspaceRoot: "/workspace",
        activeFile: "/workspace/src/login.ts",
        maxTokens: 100,
      }),
    );
    expect(contextIr.context.files[0]?.reasons).toEqual([
      { code: "test_compiler" },
    ]);
  });

  it("passes compiler cache options during initialization", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler, {
      cacheDatabasePath: "/workspace/.korix/context-cache.sqlite",
    });
    vi.spyOn(engine, "buildContext").mockResolvedValue(createContextWindow());

    await engine.buildContextIr({
      userPrompt: "fix login",
      currentFile: "/workspace/src/login.ts",
      workspaceRoot: "/workspace",
      openFiles: ["/workspace/src/login.ts"],
      tokenBudget: 100,
    });

    expect(compiler.initialize).toHaveBeenCalledWith("/workspace", {
      cacheDatabasePath: "/workspace/.korix/context-cache.sqlite",
    });
  });

  it("warms the compiler during ContextEngine initialization when a workspace root is known", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(
      compiler,
      {
        cacheDatabasePath: "/workspace/.korix/context-cache.sqlite",
      },
      "/workspace",
    );

    await engine.initialize();

    expect(compiler.initialize).toHaveBeenCalledWith("/workspace", {
      cacheDatabasePath: "/workspace/.korix/context-cache.sqlite",
    });
  });

  it("runs ContextEngine initialization as a single flight", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler, {}, "/workspace");

    await Promise.all([engine.initialize(), engine.initialize()]);

    expect(compiler.initialize).toHaveBeenCalledTimes(1);
  });

  it("keeps ContextEngine initialization best-effort when compiler warmup fails", async () => {
    const compiler = createCompiler();
    vi.mocked(compiler.initialize).mockRejectedValue(
      new Error("warmup failed"),
    );
    const engine = new ContextEngine(compiler, {}, "/workspace");

    await expect(engine.initialize()).resolves.toBeUndefined();
  });

  it("does not initialize the compiler with an empty workspace root", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler);
    vi.spyOn(engine, "buildContext").mockResolvedValue(createContextWindow());

    await engine.buildContextIr({
      userPrompt: "fix login",
      currentFile: "/workspace/src/login.ts",
      workspaceRoot: "",
      openFiles: ["/workspace/src/login.ts"],
      tokenBudget: 100,
    });

    expect(compiler.initialize).not.toHaveBeenCalled();
    expect(compiler.indexWorkspace).toHaveBeenCalled();
  });

  it("disposes the compiler facade with the context engine", () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler);

    engine.dispose();

    expect(compiler.dispose).toHaveBeenCalled();
  });

  it("schedules incremental compiler updates from workspace index events", async () => {
    const compiler = createCompiler();
    const engine = new ContextEngine(compiler, {}, "/workspace");
    const indexer = Reflect.get(
      engine,
      "indexer",
    ) as WorkspaceIndexerWithEvents;

    indexer.events.onFileIndexed?.({
      path: "/workspace/src/login.ts",
      content: "export function login() { return true; }",
      language: "typescript",
      lastModified: 1,
    });
    indexer.events.onFileDeleted?.("/workspace/src/old.ts");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(compiler.initialize).toHaveBeenCalledWith("/workspace");
    expect(compiler.updateFile).toHaveBeenCalledWith({
      path: "/workspace/src/login.ts",
      content: "export function login() { return true; }",
      language: "typescript",
      lastModified: 1,
    });
    expect(compiler.removeFile).toHaveBeenCalledWith("/workspace/src/old.ts");
  });

  it("falls back to the legacy adapter when the compiler fails", async () => {
    const compiler = createCompiler();
    vi.mocked(compiler.buildContextIr).mockRejectedValue(
      new Error("native failure"),
    );
    const engine = new ContextEngine(compiler);
    vi.spyOn(engine, "buildContext").mockResolvedValue(createContextWindow());

    const contextIr = await engine.buildContextIr({
      userPrompt: "fix login",
      currentFile: "/workspace/src/login.ts",
      workspaceRoot: "/workspace",
      openFiles: ["/workspace/src/login.ts"],
      tokenBudget: 100,
    });

    expect(contextIr.context.files[0]?.reasons).toEqual([
      { code: "legacy_context_window" },
    ]);
  });

  it("builds and formats ContextIR from the legacy context path", async () => {
    const engine = new ContextEngine();
    vi.spyOn(engine, "buildContext").mockResolvedValue(createContextWindow());

    const contextIr = await engine.buildContextIr({
      userPrompt: "fix login",
      currentFile: "/workspace/src/login.ts",
      workspaceRoot: "/workspace",
      openFiles: ["/workspace/src/login.ts"],
      tokenBudget: 100,
    });

    expect(contextIr.task.activeFile).toBe("/workspace/src/login.ts");
    expect(contextIr.workspace.root).toBe("/workspace");
    expect(contextIr.workspace.openFiles).toEqual(["/workspace/src/login.ts"]);
    expect(engine.formatContextIr(contextIr)).toContain("fix login");
    expect(engine.formatContext(createContextWindow())).toContain(
      "/workspace/src/login.ts",
    );
  });

  it("initializes before returning a workspace graph", async () => {
    const engine = new ContextEngine();
    const initialize = vi.spyOn(engine, "initialize").mockResolvedValue();
    const indexedFiles = [
      {
        path: "/workspace/src/login.ts",
        size: 10,
        lastModified: 1,
      },
    ];
    const indexer = {
      getAllFiles: () => indexedFiles,
      getAllImports: () => [],
      getSymbolsByFile: () => new Map(),
    };

    Object.defineProperty(engine, "indexer", {
      value: indexer,
    });

    const graph = await engine.getWorkspaceGraph({});

    expect(initialize).toHaveBeenCalledOnce();
    expect(graph.nodes.map((node) => node.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
  });

  it("reuses an initialized index when returning a workspace graph", async () => {
    const engine = new ContextEngine();
    const initialize = vi.spyOn(engine, "initialize");
    const indexedFiles = [
      {
        path: "/workspace/src/login.ts",
        size: 10,
        lastModified: 1,
      },
    ];
    const indexer = {
      getAllFiles: () => indexedFiles,
      getAllImports: () => [],
      getSymbolsByFile: () => new Map(),
    };

    Object.defineProperty(engine, "initialized", {
      value: true,
    });
    Object.defineProperty(engine, "indexer", {
      value: indexer,
    });

    const graph = await engine.getWorkspaceGraph({});

    expect(initialize).not.toHaveBeenCalled();
    expect(graph.nodes.map((node) => node.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
  });
});
