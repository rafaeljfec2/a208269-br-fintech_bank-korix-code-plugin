import type {
  BuildContextIrRequest,
  ContextCompiler,
  ContextCompilerOptions,
  ContextCacheSnapshot,
  ContextCompilerMetrics,
  ContextFile,
  ContextIR,
  ContextSelectionExplanation,
  ContextSummary,
  ContextWorkspace,
  IndexSummary,
  OmittedContextItem,
  WorkspaceFileInput,
} from "./types";
import {
  CONTEXT_COMPILER_CACHE_STRATEGY,
  createContextCacheFileMetadata,
  createContextCacheGraphEdges,
  createContextCacheSnapshot,
  createContextCacheSummaries,
  hashWorkspaceFileContent,
} from "./cacheStrategy";
import { directDependencyTargets } from "./importResolver";
import { extractLightweightLanguageSymbols } from "./lightweightLanguageParser";
import { SQLiteContextCacheStore } from "./sqliteContextCacheStore";
import {
  cacheEntry,
  calculateTokenSavings,
  estimateTokens,
  type FallbackCacheEntry,
  isCacheHit,
  packContextWithinBudget,
  scoreFile,
  selectedSymbols,
  summarizeFile,
} from "./fallbackContextPlanning";

export class FallbackContextCompiler implements ContextCompiler {
  private root = "";
  private files = new Map<string, WorkspaceFileInput>();
  private cache = new Map<string, FallbackCacheEntry>();
  private cacheSnapshot?: ContextCacheSnapshot;
  private cacheStore?: SQLiteContextCacheStore;

  async initialize(
    root: string,
    options: ContextCompilerOptions = {},
  ): Promise<void> {
    this.root = root;
    this.files.clear();
    this.cache.clear();
    this.cacheSnapshot = undefined;
    this.cacheStore?.close();
    this.cacheStore = undefined;

    if (options.cacheDatabasePath === undefined) {
      return;
    }

    const cacheStore = new SQLiteContextCacheStore(options.cacheDatabasePath);
    const opened = await cacheStore.open();
    if (!opened) {
      return;
    }

    this.cacheStore = cacheStore;
    const snapshot = cacheStore.loadSnapshot(
      root,
      CONTEXT_COMPILER_CACHE_STRATEGY,
    );

    if (snapshot !== undefined) {
      this.cacheSnapshot = snapshot;
      this.cache = new Map(
        snapshot.files.map((file) => [
          file.path,
          {
            contentHash: file.contentHash,
            parserVersion: file.parserVersion,
            strategyVersion: file.strategyVersion,
          },
        ]),
      );
    }
  }

  indexWorkspace(files: readonly WorkspaceFileInput[]): Promise<IndexSummary> {
    this.files = new Map(files.map((file) => [file.path, file]));
    this.cache = new Map(files.map((file) => [file.path, cacheEntry(file)]));
    this.persistCacheSnapshot(this.createIndexedSnapshot(files));
    return Promise.resolve({
      indexedFiles: this.files.size,
      indexedSymbols: files.reduce(
        (total, file) => total + extractLightweightLanguageSymbols(file).length,
        0,
      ),
    });
  }

  updateFile(file: WorkspaceFileInput): Promise<IndexSummary> {
    this.files.set(file.path, file);
    this.cache.set(file.path, cacheEntry(file));
    this.persistCacheSnapshot(this.upsertSnapshotFile(file));
    return Promise.resolve({
      indexedFiles: this.cache.size,
      indexedSymbols: Array.from(this.files.values()).reduce(
        (total, indexedFile) =>
          total + extractLightweightLanguageSymbols(indexedFile).length,
        0,
      ),
    });
  }

  removeFile(path: string): Promise<void> {
    this.files.delete(path);
    this.cache.delete(path);
    this.persistCacheSnapshot(this.removeSnapshotFile(path));
    return Promise.resolve();
  }

  buildContextIr(request: BuildContextIrRequest): Promise<ContextIR> {
    const start = Date.now();
    const candidateFiles =
      request.files.length > 0
        ? request.files
        : Array.from(this.files.values());
    const dependencyTargets = directDependencyTargets(
      request.activeFile,
      candidateFiles,
    );
    const cacheHits = candidateFiles.filter((file) =>
      isCacheHit(this.cache.get(file.path), file),
    ).length;
    const scored = candidateFiles
      .map((file) => scoreFile(file, request, dependencyTargets))
      .filter((file) => file.score > 0)
      .sort((left, right) => right.score - left.score);
    const selected: ContextFile[] = [];
    const summaries: ContextSummary[] = [];
    const omitted: OmittedContextItem[] = [];
    let estimatedTokens = 0;

    for (const file of scored) {
      if (estimatedTokens + file.estimatedTokens > request.maxTokens) {
        const sourceFile = candidateFiles.find(
          (candidate) => candidate.path === file.path,
        );
        if (sourceFile !== undefined) {
          const summary = summarizeFile(sourceFile);
          if (estimatedTokens + summary.estimatedTokens <= request.maxTokens) {
            estimatedTokens += summary.estimatedTokens;
            summaries.push(summary);
          }
        }

        omitted.push({
          id: file.path,
          kind: "file",
          path: file.path,
          score: file.score,
          reason: "budget_exceeded",
        });
        continue;
      }

      estimatedTokens += file.estimatedTokens;
      selected.push(file);
    }

    const packed = packContextWithinBudget(
      selected,
      summaries,
      selectedSymbols(selected, candidateFiles, request),
      request.maxTokens,
    );
    estimatedTokens = packed.estimatedTokens;

    const tokensBeforeOptimization = candidateFiles.reduce(
      (total, file) => total + estimateTokens(file.content),
      0,
    );
    const metrics: ContextCompilerMetrics = {
      contextBuildLatencyMs: Date.now() - start,
      selectedFilesCount: packed.files.length,
      selectedSymbolsCount: packed.symbols.length,
      selectedDiagnosticsCount: request.diagnostics.length,
      selectedRelevantSymbolsCount: packed.symbols.length,
      legacyBaselineTokens: tokensBeforeOptimization,
      tokenSavingsPercent: calculateTokenSavings(
        tokensBeforeOptimization,
        estimatedTokens,
      ),
      contextValuePerToken:
        estimatedTokens > 0
          ? (packed.files.length + packed.symbols.length) / estimatedTokens
          : 0,
      cacheHitRatio:
        candidateFiles.length > 0 ? cacheHits / candidateFiles.length : 0,
    };
    if (summaries.length > 0) {
      this.persistCacheSnapshot(this.upsertSnapshotSummaries(summaries));
    }

    const workspace: ContextWorkspace = {
      root:
        request.workspaceRoot.length > 0 ? request.workspaceRoot : this.root,
      languageHints: Array.from(
        new Set(
          candidateFiles
            .map((file) => file.language)
            .filter((language): language is string => language !== undefined),
        ),
      ),
      openFiles: request.openFiles,
      changedFiles: request.changedFiles,
    };

    return Promise.resolve({
      version: "0.1",
      task: {
        userPrompt: request.userPrompt,
        activeFile: request.activeFile,
        activeSelection: request.activeSelection,
        mentionedSymbols: request.mentionedSymbols,
        constraints: [],
      },
      workspace,
      budget: {
        maxTokens: request.maxTokens,
        estimatedTokens,
        tokensBeforeOptimization,
      },
      context: {
        symbols: packed.symbols,
        files: packed.files,
        summaries,
        diagnostics: request.diagnostics,
      },
      omitted,
      metrics,
    });
  }

  async explainSelection(
    request: BuildContextIrRequest,
  ): Promise<ContextSelectionExplanation> {
    const contextIr = await this.buildContextIr(request);
    return {
      selectedFiles: contextIr.context.files,
      selectedSymbols: contextIr.context.symbols,
      omitted: contextIr.omitted,
      metrics: contextIr.metrics,
    };
  }

  private persistCacheSnapshot(snapshot: ContextCacheSnapshot): void {
    this.cacheSnapshot = snapshot;

    if (this.cacheStore !== undefined && this.root.length > 0) {
      this.cacheStore.saveSnapshot(this.root, snapshot);
    }
  }

  private currentSnapshot(): ContextCacheSnapshot {
    return (
      this.cacheSnapshot ??
      createContextCacheSnapshot(Array.from(this.files.values()))
    );
  }

  private createIndexedSnapshot(
    files: readonly WorkspaceFileInput[],
  ): ContextCacheSnapshot {
    const previousSummaries = this.cacheSnapshot?.summaries ?? [];
    const contentHashes = new Map(
      files.map((file) => [file.path, hashWorkspaceFileContent(file.content)]),
    );
    const snapshot = createContextCacheSnapshot(files);

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
      createContextCacheFileMetadata(file),
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

  getCacheSnapshot(): ContextCacheSnapshot | undefined {
    return this.cacheSnapshot;
  }

  dispose(): void {
    this.cacheStore?.close();
    this.cacheStore = undefined;
  }
}
