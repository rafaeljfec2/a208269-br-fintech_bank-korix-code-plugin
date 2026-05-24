import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createContextCompiler,
  FallbackContextCompiler,
  getNativeArtifactCandidates,
  getNativeTarget,
  isNodeSQLiteRuntimeAvailable,
  NativeContextCompiler,
  nativeArtifactName,
  NATIVE_CONTEXT_COMPILER_TARGETS,
  type BuildContextIrRequest,
  type ContextCompilerOptions,
  type ContextIR,
  type ContextSelectionExplanation,
  type IndexSummary,
  type WorkspaceFileInput,
} from "@korix/context-compiler";

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
    diagnostics: [],
    maxTokens: 100,
    files: [
      {
        path: "/workspace/src/login.ts",
        content: "export function login() { return true; }",
        language: "typescript",
      },
    ],
    ...overrides,
  };
}

function createContextIr(): ContextIR {
  return {
    version: "0.1",
    task: {
      userPrompt: "Fix login",
      activeFile: "/workspace/src/login.ts",
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
      estimatedTokens: 10,
      tokensBeforeOptimization: 40,
    },
    context: {
      symbols: [],
      files: [],
      summaries: [],
      diagnostics: [],
    },
    omitted: [],
    metrics: {
      contextBuildLatencyMs: 1,
      selectedFilesCount: 0,
      selectedSymbolsCount: 0,
      selectedDiagnosticsCount: 0,
      selectedRelevantSymbolsCount: 0,
      legacyBaselineTokens: 40,
      tokenSavingsPercent: 75,
      contextValuePerToken: 0,
      cacheHitRatio: 0,
    },
  };
}

function createNativeModule(contextIr = createContextIr()) {
  const indexSummary: IndexSummary = {
    indexedFiles: 1,
    indexedSymbols: 1,
  };
  const explanation: ContextSelectionExplanation = {
    selectedFiles: [],
    selectedSymbols: [],
    omitted: [],
    metrics: contextIr.metrics,
  };

  return {
    initialize: vi.fn(
      (_root: string, _options?: ContextCompilerOptions) => undefined,
    ),
    indexWorkspace: vi.fn(
      (_files: readonly WorkspaceFileInput[]) => indexSummary,
    ),
    updateFile: vi.fn((_file: WorkspaceFileInput) => indexSummary),
    removeFile: vi.fn((_path: string) => undefined),
    buildContextIr: vi.fn((_request: BuildContextIrRequest) => contextIr),
    explainSelection: vi.fn(
      (_request: BuildContextIrRequest) => explanation,
    ),
  };
}

describe("native context compiler boundary", () => {
  it("defines an explicit native artifact matrix", () => {
    expect(NATIVE_CONTEXT_COMPILER_TARGETS).toEqual([
      "darwin-arm64",
      "darwin-universal",
      "darwin-x64",
      "linux-arm64-gnu",
      "linux-arm64-musl",
      "linux-x64-gnu",
      "linux-x64-musl",
      "win32-arm64-msvc",
      "win32-x64-msvc",
    ]);
    expect(nativeArtifactName("linux-x64-gnu")).toBe(
      "index.linux-x64-gnu.node",
    );
  });

  it("resolves runtime native targets with platform-specific fallbacks", () => {
    expect(
      getNativeTarget({
        platform: "linux",
        arch: "x64",
        glibcVersionRuntime: "2.39",
      }),
    ).toBe("linux-x64-gnu");
    expect(
      getNativeTarget({
        platform: "linux",
        arch: "arm64",
      }),
    ).toBe("linux-arm64-musl");
    expect(getNativeTarget({ platform: "win32", arch: "x64" })).toBe(
      "win32-x64-msvc",
    );
    expect(getNativeTarget({ platform: "freebsd", arch: "x64" })).toBeUndefined();
  });

  it("adds the universal Darwin binary as a fallback candidate", () => {
    expect(getNativeArtifactCandidates("darwin-arm64")).toEqual([
      "index.darwin-arm64.node",
      "index.darwin-universal.node",
    ]);
    expect(getNativeArtifactCandidates("linux-x64-gnu")).toEqual([
      "index.linux-x64-gnu.node",
    ]);
  });

  it("uses fallback compiler when the native module is unavailable", async () => {
    const compiler = createContextCompiler(() => undefined);

    expect(compiler).toBeInstanceOf(FallbackContextCompiler);
    await compiler.initialize("/workspace");
    const contextIr = await compiler.buildContextIr(createRequest());

    expect(contextIr.workspace.root).toBe("/workspace");
    expect(contextIr.context.files.map((file) => file.path)).toEqual([
      "/workspace/src/login.ts",
    ]);
  });

  it("uses fallback compiler when the native module is only scaffolded", () => {
    const compiler = createContextCompiler(() => ({
      compilerVersion: () => "0.1.0",
    }));

    expect(compiler).toBeInstanceOf(FallbackContextCompiler);
  });

  it("preserves native compiler when SQLite persistence is configured", () => {
    const nativeModule = {
      initialize: vi.fn(
        (_root: string, _options?: ContextCompilerOptions) => undefined,
      ),
      indexWorkspace: vi.fn((_files: readonly WorkspaceFileInput[]) => ({
        indexedFiles: 0,
        indexedSymbols: 0,
      })),
      updateFile: vi.fn((_file: WorkspaceFileInput) => ({
        indexedFiles: 0,
        indexedSymbols: 0,
      })),
      removeFile: vi.fn((_path: string) => undefined),
      buildContextIr: vi.fn((_request: BuildContextIrRequest) => createContextIr()),
      explainSelection: vi.fn(
        (_request: BuildContextIrRequest): ContextSelectionExplanation => ({
          selectedFiles: [],
          selectedSymbols: [],
          omitted: [],
          metrics: createContextIr().metrics,
        }),
      ),
    };

    const compiler = createContextCompiler(
      () => nativeModule,
      { cacheDatabasePath: "/workspace/cache.sqlite" },
    );

    expect(compiler).toBeInstanceOf(NativeContextCompiler);
  });

  it("uses fallback compiler with SQLite persistence when native is unavailable", () => {
    const compiler = createContextCompiler(
      () => undefined,
      { cacheDatabasePath: "/workspace/cache.sqlite" },
    );

    expect(compiler).toBeInstanceOf(FallbackContextCompiler);
  });

  it("persists native wrapper cache snapshots without downgrading the backend", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-native-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const firstNativeModule = createNativeModule();
      const compiler = createContextCompiler(
        () => firstNativeModule,
        { cacheDatabasePath: databasePath },
      );

      expect(compiler).toBeInstanceOf(NativeContextCompiler);
      await compiler.initialize("/workspace", { cacheDatabasePath: databasePath });
      await compiler.indexWorkspace([
        {
          path: "/workspace/src/login.ts",
          content: "import { createSession } from './session';",
          language: "typescript",
        },
      ]);
      compiler.dispose();

      const secondNativeModule = createNativeModule();
      const warmedCompiler = createContextCompiler(
        () => secondNativeModule,
        { cacheDatabasePath: databasePath },
      );

      expect(warmedCompiler).toBeInstanceOf(NativeContextCompiler);
      await warmedCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      if (!(warmedCompiler instanceof NativeContextCompiler)) {
        throw new Error("Expected native context compiler");
      }

      expect(warmedCompiler.getCacheSnapshot()?.graphEdges).toEqual([
        {
          from: "/workspace/src/login.ts",
          to: "./session",
          type: "import",
        },
      ]);
      expect(warmedCompiler.getCacheSnapshot()?.strategy).toEqual({
        contentHashAlgorithm: "fnv1a64-utf8",
        parserVersion: "tree-sitter-ts-js-v1",
        strategyVersion: "native-score-v1",
      });
      warmedCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves native wrapper cache snapshots during incremental updates and removes", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-native-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const compiler = createContextCompiler(
        () => createNativeModule(),
        { cacheDatabasePath: databasePath },
      );
      await compiler.initialize("/workspace", { cacheDatabasePath: databasePath });
      await compiler.indexWorkspace([
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
      ]);
      compiler.dispose();

      const warmedCompiler = createContextCompiler(
        () => createNativeModule(),
        { cacheDatabasePath: databasePath },
      );
      await warmedCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });
      await warmedCompiler.updateFile({
        path: "/workspace/src/login.ts",
        content: "import { authorize } from './auth';",
        language: "typescript",
      });
      await warmedCompiler.removeFile("/workspace/src/login.ts");
      warmedCompiler.dispose();

      const reloadedCompiler = createContextCompiler(
        () => createNativeModule(),
        { cacheDatabasePath: databasePath },
      );
      await reloadedCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      if (!(reloadedCompiler instanceof NativeContextCompiler)) {
        throw new Error("Expected native context compiler");
      }

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

  it("persists native wrapper summaries in the SQLite cache snapshot", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-native-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const content = "export const value0 = 0;";
      const sourceHash = "cb68906c341ea1ad";
      const expectedCachedSummaries = [
        {
          id: "summary:/workspace/src/large.ts",
          kind: "file" as const,
          path: "/workspace/src/large.ts",
          sourceHash,
          summary: content,
          estimatedTokens: 6,
          reasonCodes: ["budget_summary"],
        },
      ];
      const baseContextIr = createContextIr();
      const contextIr: ContextIR = {
        ...baseContextIr,
        context: {
          ...baseContextIr.context,
          summaries: [
            {
              id: "summary:/workspace/src/large.ts",
              kind: "file",
              path: "/workspace/src/large.ts",
              sourceHash,
              summary: content,
              estimatedTokens: 6,
              reasons: [{ code: "budget_summary" }],
            },
          ],
        },
      };
      const compiler = createContextCompiler(
        () => createNativeModule(contextIr),
        { cacheDatabasePath: databasePath },
      );
      await compiler.initialize("/workspace", { cacheDatabasePath: databasePath });
      await compiler.indexWorkspace([
        {
          path: "/workspace/src/large.ts",
          content,
          language: "typescript",
        },
      ]);
      await compiler.buildContextIr(createRequest());
      compiler.dispose();

      const warmedCompiler = createContextCompiler(
        () => createNativeModule(),
        { cacheDatabasePath: databasePath },
      );
      await warmedCompiler.initialize("/workspace", {
        cacheDatabasePath: databasePath,
      });

      if (!(warmedCompiler instanceof NativeContextCompiler)) {
        throw new Error("Expected native context compiler");
      }

      expect(warmedCompiler.getCacheSnapshot()?.summaries).toEqual(
        expectedCachedSummaries,
      );
      await warmedCompiler.indexWorkspace([
        {
          path: "/workspace/src/large.ts",
          content,
          language: "typescript",
        },
      ]);
      expect(warmedCompiler.getCacheSnapshot()?.summaries).toEqual(
        expectedCachedSummaries,
      );
      await warmedCompiler.updateFile({
        path: "/workspace/src/large.ts",
        content: "export const value1 = 1;",
        language: "typescript",
      });
      expect(warmedCompiler.getCacheSnapshot()?.summaries).toEqual([]);
      warmedCompiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("closes native wrapper SQLite state when native initialization fails", async () => {
    if (!isNodeSQLiteRuntimeAvailable()) {
      expect(isNodeSQLiteRuntimeAvailable()).toBe(false);
      return;
    }

    const directory = await mkdtemp(
      path.join(tmpdir(), "korix-native-context-compiler-"),
    );
    const databasePath = path.join(directory, "context-cache.sqlite");

    try {
      const nativeModule = createNativeModule();
      nativeModule.initialize.mockRejectedValue(new Error("native init failed"));
      const compiler = createContextCompiler(
        () => nativeModule,
        { cacheDatabasePath: databasePath },
      );

      await expect(
        compiler.initialize("/workspace", { cacheDatabasePath: databasePath }),
      ).rejects.toThrow("native init failed");

      if (!(compiler instanceof NativeContextCompiler)) {
        throw new Error("Expected native context compiler");
      }

      expect(compiler.getCacheSnapshot()).toBeUndefined();
      compiler.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("wraps a complete native compiler module", async () => {
    const indexSummary: IndexSummary = {
      indexedFiles: 1,
      indexedSymbols: 1,
    };
    const contextIr = createContextIr();
    const explanation: ContextSelectionExplanation = {
      selectedFiles: [],
      selectedSymbols: [],
      omitted: [],
      metrics: contextIr.metrics,
    };
    const nativeModule = {
      initialize: vi.fn(
        (_root: string, _options?: ContextCompilerOptions) => undefined,
      ),
      indexWorkspace: vi.fn(
        (_files: readonly WorkspaceFileInput[]) => indexSummary,
      ),
      updateFile: vi.fn((_file: WorkspaceFileInput) => indexSummary),
      removeFile: vi.fn((_path: string) => undefined),
      buildContextIr: vi.fn((_request: BuildContextIrRequest) => contextIr),
      explainSelection: vi.fn(
        (_request: BuildContextIrRequest) => explanation,
      ),
    };

    const compiler = createContextCompiler(() => nativeModule);
    const request = createRequest();
    const firstFile = request.files[0];
    if (firstFile === undefined) {
      throw new Error("Expected request fixture to include a file");
    }

    expect(compiler).toBeInstanceOf(NativeContextCompiler);
    await expect(compiler.initialize("/workspace")).resolves.toBeUndefined();
    await expect(compiler.indexWorkspace(request.files)).resolves.toBe(
      indexSummary,
    );
    await expect(compiler.updateFile(firstFile)).resolves.toBe(indexSummary);
    await expect(
      compiler.removeFile("/workspace/src/login.ts"),
    ).resolves.toBeUndefined();
    await expect(compiler.buildContextIr(createRequest())).resolves.toBe(
      contextIr,
    );
    await expect(compiler.explainSelection(createRequest())).resolves.toBe(
      explanation,
    );
  });
});
