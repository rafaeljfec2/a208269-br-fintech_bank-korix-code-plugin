import { createRequire } from "node:module";
import {
  createContextCacheGraphEdges,
  createContextCacheSummaries,
} from "./cacheStrategy";
import { FallbackContextCompiler } from "./fallbackContextCompiler";
import { getNativeArtifactCandidates, getNativeTarget } from "./nativeTargets";
import { SQLiteContextCacheStore } from "./sqliteContextCacheStore";
import type {
  BuildContextIrRequest,
  ContextCacheFileMetadata,
  ContextCacheSnapshot,
  ContextCacheStrategy,
  ContextCompiler,
  ContextCompilerOptions,
  ContextIR,
  ContextSummary,
  ContextSelectionExplanation,
  IndexSummary,
  WorkspaceFileInput,
} from "./types";

const NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY: ContextCacheStrategy = {
  contentHashAlgorithm: "fnv1a64-utf8",
  parserVersion: "tree-sitter-ts-js-v1",
  strategyVersion: "native-score-v1",
};

interface NativeContextCompilerModule {
  readonly initialize: (
    root: string,
    options?: ContextCompilerOptions,
  ) => void | Promise<void>;
  readonly indexWorkspace: (
    files: readonly WorkspaceFileInput[],
  ) => IndexSummary | Promise<IndexSummary>;
  readonly updateFile: (
    file: WorkspaceFileInput,
  ) => IndexSummary | Promise<IndexSummary>;
  readonly removeFile: (path: string) => void | Promise<void>;
  readonly buildContextIr: (
    request: BuildContextIrRequest,
  ) => ContextIR | Promise<ContextIR>;
  readonly explainSelection: (
    request: BuildContextIrRequest,
  ) => ContextSelectionExplanation | Promise<ContextSelectionExplanation>;
}

type NativeLoader = () => unknown;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hashNativeWorkspaceFileContent(content: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const byte of new TextEncoder().encode(content)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function createNativeContextCacheFileMetadata(
  file: WorkspaceFileInput,
): ContextCacheFileMetadata {
  return {
    path: file.path,
    contentHash: hashNativeWorkspaceFileContent(file.content),
    parserVersion: NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY.parserVersion,
    strategyVersion: NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY.strategyVersion,
    language: file.language,
    lastModified: file.lastModified,
    estimatedTokens: estimateTokens(file.content),
  };
}

function createNativeContextCacheSnapshot(
  files: readonly WorkspaceFileInput[],
): ContextCacheSnapshot {
  return {
    version: "0.1",
    strategy: NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY,
    files: files.map(createNativeContextCacheFileMetadata),
    graphEdges: createContextCacheGraphEdges(files),
  };
}

function isFunction(
  value: unknown,
): value is (...args: readonly unknown[]) => unknown {
  return typeof value === "function";
}

function glibcVersionRuntime(): unknown {
  if (typeof process.report?.getReport !== "function") {
    return undefined;
  }

  const report = process.report.getReport();
  if (typeof report !== "object" || report === null || !("header" in report)) {
    return undefined;
  }

  const header = report.header;
  if (typeof header !== "object" || header === null) {
    return undefined;
  }

  return (header as Record<string, unknown>).glibcVersionRuntime;
}

function isNativeContextCompilerModule(
  value: unknown,
): value is NativeContextCompilerModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isFunction(candidate.initialize) &&
    isFunction(candidate.indexWorkspace) &&
    isFunction(candidate.updateFile) &&
    isFunction(candidate.removeFile) &&
    isFunction(candidate.buildContextIr) &&
    isFunction(candidate.explainSelection)
  );
}

function loadDefaultNativeModule(): unknown {
  const require = createRequire(
    typeof __filename === "string" ? __filename : process.cwd(),
  );
  const nativeTarget = getNativeTarget({
    platform: process.platform,
    arch: process.arch,
    glibcVersionRuntime: glibcVersionRuntime(),
  });
  const artifactCandidates =
    nativeTarget === undefined ? [] : getNativeArtifactCandidates(nativeTarget);
  const candidates = [
    ...artifactCandidates.map((artifact) => `./native/${artifact}`),
    ...artifactCandidates.map(
      (artifact) => `../packages/context-compiler/native/${artifact}`,
    ),
    `../context-compiler.${process.platform}-${process.arch}.node`,
    "../context-compiler.node",
    ...artifactCandidates.map((artifact) => `../native/${artifact}`),
    "./context-compiler.node",
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  return undefined;
}

export class NativeContextCompiler implements ContextCompiler {
  private root = "";
  private cacheStore?: SQLiteContextCacheStore;
  private cacheSnapshot?: ContextCacheSnapshot;

  constructor(private readonly native: NativeContextCompilerModule) {}

  async initialize(
    root: string,
    options?: ContextCompilerOptions,
  ): Promise<void> {
    this.root = root;
    this.cacheStore?.close();
    this.cacheStore = undefined;
    this.cacheSnapshot = undefined;

    try {
      if (options?.cacheDatabasePath !== undefined) {
        const cacheStore = new SQLiteContextCacheStore(
          options.cacheDatabasePath,
        );
        const opened = await cacheStore.open();
        if (opened) {
          this.cacheStore = cacheStore;
          this.cacheSnapshot = cacheStore.loadSnapshot(
            root,
            NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY,
          );
        }
      }

      await Promise.resolve(this.native.initialize(root, options));
    } catch (error) {
      this.cacheStore?.close();
      this.cacheStore = undefined;
      this.cacheSnapshot = undefined;
      this.root = "";
      throw error;
    }
  }

  async indexWorkspace(
    files: readonly WorkspaceFileInput[],
  ): Promise<IndexSummary> {
    const summary = await Promise.resolve(this.native.indexWorkspace(files));
    this.persistCacheSnapshot(this.createIndexedSnapshot(files));
    return summary;
  }

  async updateFile(file: WorkspaceFileInput): Promise<IndexSummary> {
    const summary = await Promise.resolve(this.native.updateFile(file));
    this.persistCacheSnapshot(this.upsertSnapshotFile(file));
    return summary;
  }

  async removeFile(path: string): Promise<void> {
    await Promise.resolve(this.native.removeFile(path));
    this.persistCacheSnapshot(this.removeSnapshotFile(path));
  }

  async buildContextIr(request: BuildContextIrRequest): Promise<ContextIR> {
    const contextIr = await Promise.resolve(
      this.native.buildContextIr(request),
    );
    if (contextIr.context.summaries.length > 0) {
      this.persistCacheSnapshot(
        this.upsertSnapshotSummaries(contextIr.context.summaries),
      );
    }

    return contextIr;
  }

  explainSelection(
    request: BuildContextIrRequest,
  ): Promise<ContextSelectionExplanation> {
    return Promise.resolve(this.native.explainSelection(request));
  }

  dispose(): void {
    this.cacheStore?.close();
    this.cacheStore = undefined;
  }

  getCacheSnapshot(): ContextCacheSnapshot | undefined {
    return this.cacheSnapshot;
  }

  private persistCacheSnapshot(snapshot: ContextCacheSnapshot): void {
    this.cacheSnapshot = snapshot;

    if (this.cacheStore !== undefined && this.root.length > 0) {
      this.cacheStore.saveSnapshot(this.root, snapshot);
    }
  }

  private currentSnapshot(): ContextCacheSnapshot {
    return (
      this.cacheSnapshot ?? {
        version: "0.1",
        strategy: NATIVE_CONTEXT_COMPILER_CACHE_STRATEGY,
        files: [],
        graphEdges: [],
        summaries: [],
      }
    );
  }

  private createIndexedSnapshot(
    files: readonly WorkspaceFileInput[],
  ): ContextCacheSnapshot {
    const previousSummaries = this.cacheSnapshot?.summaries ?? [];
    const contentHashes = new Map(
      files.map((file) => [
        file.path,
        hashNativeWorkspaceFileContent(file.content),
      ]),
    );
    const snapshot = createNativeContextCacheSnapshot(files);

    return {
      ...snapshot,
      summaries: previousSummaries.filter(
        (summary) => contentHashes.get(summary.path) === summary.sourceHash,
      ),
    };
  }

  private upsertSnapshotFile(file: WorkspaceFileInput): ContextCacheSnapshot {
    const snapshot = this.currentSnapshot();
    const files = [
      ...snapshot.files.filter((entry) => entry.path !== file.path),
      createNativeContextCacheFileMetadata(file),
    ].sort((left, right) => left.path.localeCompare(right.path));
    const graphEdges = [
      ...(snapshot.graphEdges ?? []).filter((edge) => edge.from !== file.path),
      ...createContextCacheGraphEdges([file]),
    ].sort((left, right) =>
      `${left.from}\0${left.to}\0${left.type}`.localeCompare(
        `${right.from}\0${right.to}\0${right.type}`,
      ),
    );

    return {
      ...snapshot,
      files,
      graphEdges,
      summaries: (snapshot.summaries ?? []).filter(
        (summary) => summary.path !== file.path,
      ),
    };
  }

  private removeSnapshotFile(path: string): ContextCacheSnapshot {
    const snapshot = this.currentSnapshot();

    return {
      ...snapshot,
      files: snapshot.files.filter((entry) => entry.path !== path),
      graphEdges: (snapshot.graphEdges ?? []).filter(
        (edge) => edge.from !== path,
      ),
      summaries: (snapshot.summaries ?? []).filter(
        (summary) => summary.path !== path,
      ),
    };
  }

  private upsertSnapshotSummaries(
    summaries: readonly ContextSummary[],
  ): ContextCacheSnapshot {
    const snapshot = this.currentSnapshot();
    const summaryPaths = new Set(summaries.map((summary) => summary.path));

    return {
      ...snapshot,
      summaries: [
        ...(snapshot.summaries ?? []).filter(
          (summary) => !summaryPaths.has(summary.path),
        ),
        ...createContextCacheSummaries(summaries),
      ].sort((left, right) => left.id.localeCompare(right.id)),
    };
  }
}

export function createContextCompiler(
  loadNativeModule: NativeLoader = loadDefaultNativeModule,
  _options: ContextCompilerOptions = {},
): ContextCompiler {
  const nativeModule = loadNativeModule();
  if (isNativeContextCompilerModule(nativeModule)) {
    return new NativeContextCompiler(nativeModule);
  }

  return new FallbackContextCompiler();
}
