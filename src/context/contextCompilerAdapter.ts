import {
  formatContextIrForProvider,
  type BuildContextIrRequest,
  type ContextDiagnostic,
  type ContextFile,
  type ContextIR,
  type ContextReason,
  type SourceRange,
  type WorkspaceFileInput,
  type WorkspaceGraph,
} from "@korix/context-compiler";
import * as path from "node:path";
import type { ContextWindow, ImportInfo, SymbolInfo } from "./types";

function reason(code: string): ContextReason {
  return { code };
}

function tokenSavings(before: number, after: number): number {
  /* v8 ignore next -- defensive zero-baseline guard; normal legacy windows contain at least one token */
  if (before <= 0) {
    return 0;
  }

  return Math.max(0, ((before - after) / before) * 100);
}

function toContextFile(item: ContextWindow["items"][number]): ContextFile {
  return {
    path: item.file,
    score: item.priority,
    scoreFactors: [
      {
        name: "active_editor_proximity",
        value: item.priority > 0 ? 1 : 0,
        weight: 0.25,
        contribution: item.priority > 0 ? 0.25 : 0,
      },
    ],
    includedMode: "full",
    reasons: [reason("legacy_context_window")],
    estimatedTokens: item.tokenCount,
    content: item.content,
  };
}

export interface LegacyContextIrOptions {
  readonly userPrompt?: string;
  readonly workspaceRoot?: string;
  readonly currentFile?: string;
  readonly activeFile?: string;
  readonly userSelection?: {
    readonly file: string;
    readonly range: {
      readonly start: {
        readonly line: number;
        readonly character: number;
      };
      readonly end: {
        readonly line: number;
        readonly character: number;
      };
    };
  };
  readonly openFiles?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly mentionedSymbols?: readonly string[];
  readonly diagnostics?: readonly ContextDiagnostic[];
  readonly tokenBudget?: number;
}

function toSourceRange(
  options: LegacyContextIrOptions,
): SourceRange | undefined {
  const activeFile = options.activeFile ?? options.currentFile;
  if (
    options.userSelection === undefined ||
    options.userSelection.file !== activeFile
  ) {
    return undefined;
  }

  return {
    startLine: options.userSelection.range.start.line,
    startColumn: options.userSelection.range.start.character,
    endLine: options.userSelection.range.end.line,
    endColumn: options.userSelection.range.end.character,
  };
}

function toWorkspaceFileInput(
  item: ContextWindow["items"][number],
): WorkspaceFileInput {
  return {
    path: item.file,
    content: item.content,
    selectionPriority: item.priority,
  };
}

export function contextWindowToIr(
  contextWindow: ContextWindow,
  options: LegacyContextIrOptions = {},
): ContextIR {
  const files = contextWindow.items.map(toContextFile);
  const estimatedTokens = files.reduce(
    (total, file) => total + file.estimatedTokens,
    0,
  );
  const legacyBaselineTokens = estimatedTokens;

  return {
    version: "0.1",
    task: {
      userPrompt: options.userPrompt ?? "",
      activeFile: options.activeFile,
      activeSelection: toSourceRange(options),
      mentionedSymbols: options.mentionedSymbols ?? [],
      constraints: [],
    },
    workspace: {
      root: options.workspaceRoot ?? "",
      languageHints: [],
      openFiles: options.openFiles ?? [],
      changedFiles: options.changedFiles ?? [],
    },
    budget: {
      maxTokens: contextWindow.budget,
      estimatedTokens,
      tokensBeforeOptimization: legacyBaselineTokens,
    },
    context: {
      symbols: [],
      files,
      summaries: [],
      diagnostics: [],
    },
    omitted: [],
    metrics: {
      contextBuildLatencyMs: 0,
      selectedFilesCount: files.length,
      selectedSymbolsCount: 0,
      selectedDiagnosticsCount: 0,
      selectedRelevantSymbolsCount: 0,
      legacyBaselineTokens,
      tokenSavingsPercent: tokenSavings(legacyBaselineTokens, estimatedTokens),
      contextValuePerToken:
        estimatedTokens > 0 ? files.length / estimatedTokens : 0,
      cacheHitRatio: 0,
    },
  };
}

export function contextWindowToCompilerRequest(
  contextWindow: ContextWindow,
  options: LegacyContextIrOptions = {},
): BuildContextIrRequest {
  const activeFile =
    options.activeFile ?? options.currentFile ?? options.userSelection?.file;

  return {
    userPrompt: options.userPrompt ?? "",
    workspaceRoot: options.workspaceRoot ?? "",
    activeFile,
    activeSelection: toSourceRange({ ...options, activeFile }),
    openFiles: options.openFiles ?? [],
    changedFiles: options.changedFiles ?? [],
    mentionedSymbols: options.mentionedSymbols ?? [],
    diagnostics: options.diagnostics ?? [],
    maxTokens: options.tokenBudget ?? contextWindow.budget,
    files: contextWindow.items.map(toWorkspaceFileInput),
  };
}

export function formatContextWindow(
  contextWindow: ContextWindow,
  options: LegacyContextIrOptions = {},
): string {
  return formatContextIrForProvider(contextWindowToIr(contextWindow, options));
}

export interface WorkspaceGraphInput {
  readonly files: readonly string[];
  readonly imports: readonly ImportInfo[];
  readonly symbolsByFile: ReadonlyMap<string, readonly SymbolInfo[]>;
  readonly rootFile?: string;
  readonly maxDepth?: number;
}

interface WorkspaceGraphMaps {
  readonly adjacency: Map<string, Set<string>>;
  readonly reverse: Map<string, Set<string>>;
}

function resolveImportTarget(
  source: string,
  target: string,
  files: readonly string[],
): string | undefined {
  if (target.startsWith(".")) {
    const resolved = path.resolve(path.dirname(source), target);
    return files.find(
      (file) => file === resolved || file.startsWith(`${resolved}.`),
    );
  }

  /* v8 ignore next -- package names are a temporary fallback until native import resolution exists */
  return files.find((file) => file.includes(target) || target.includes(file));
}

function createWorkspaceGraphMaps(files: readonly string[]): WorkspaceGraphMaps {
  const adjacency = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const file of files) {
    adjacency.set(file, new Set());
    reverse.set(file, new Set());
  }

  return { adjacency, reverse };
}

function addImportEdges(
  imports: readonly ImportInfo[],
  files: readonly string[],
  maps: WorkspaceGraphMaps,
): void {
  for (const entry of imports) {
    if (entry.isExternal) {
      continue;
    }

    const target = resolveImportTarget(entry.source, entry.target, files);
    if (target === undefined) {
      continue;
    }

    maps.adjacency.get(entry.source)?.add(target);
    maps.reverse.get(target)?.add(entry.source);
  }
}

function buildDistanceMap(
  files: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  rootFile: string | undefined,
  maxDepth: number,
): Map<string, number> {
  const distanceByFile = new Map<string, number>();
  if (rootFile === undefined || !adjacency.has(rootFile)) {
    for (const file of files) {
      distanceByFile.set(file, 0);
    }
    return distanceByFile;
  }

  const queue: string[] = [rootFile];
  distanceByFile.set(rootFile, 0);
  let index = 0;

  while (index < queue.length) {
    const current = queue[index];
    index += 1;

    /* v8 ignore next -- queue index is bounded by queue.length, so this is defensive for noUncheckedIndexedAccess */
    if (current === undefined) {
      continue;
    }

    /* v8 ignore next -- every queued file is assigned a distance before enqueue */
    const distance = distanceByFile.get(current) ?? 0;
    if (distance >= maxDepth) {
      continue;
    }

    /* v8 ignore next -- adjacency is initialized for every file before traversal */
    for (const next of adjacency.get(current) ?? []) {
      if (!distanceByFile.has(next)) {
        distanceByFile.set(next, distance + 1);
        queue.push(next);
      }
    }
  }

  return distanceByFile;
}

function buildGraphNodes(
  files: readonly string[],
  maps: WorkspaceGraphMaps,
  symbolsByFile: ReadonlyMap<string, readonly SymbolInfo[]>,
  distanceByFile: ReadonlyMap<string, number>,
): WorkspaceGraph["nodes"] {
  return files
    .filter((file) => distanceByFile.has(file))
    .map((file) => ({
      path: file,
      /* v8 ignore next -- adjacency is initialized for every included file before node formatting */
      imports: Array.from(maps.adjacency.get(file) ?? []).filter((target) =>
        distanceByFile.has(target),
      ),
      /* v8 ignore next -- reverse adjacency is initialized for every included file before node formatting */
      importedBy: Array.from(maps.reverse.get(file) ?? []).filter((source) =>
        distanceByFile.has(source),
      ),
      symbols: (symbolsByFile.get(file) ?? []).map((symbol) => symbol.name),
      distance: distanceByFile.get(file),
    }));
}

function buildGraphEdges(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  distanceByFile: ReadonlyMap<string, number>,
): WorkspaceGraph["edges"] {
  return Array.from(adjacency.entries()).flatMap(([file, outgoing]) => {
    if (!distanceByFile.has(file)) {
      return [];
    }

    return Array.from(outgoing)
      .filter((target) => distanceByFile.has(target))
      .map((target) => ({
        from: file,
        to: target,
        type: "import" as const,
      }));
  });
}

export function buildWorkspaceGraphFromIndex(
  input: WorkspaceGraphInput,
): WorkspaceGraph {
  const maxDepth = input.maxDepth ?? 3;
  const maps = createWorkspaceGraphMaps(input.files);
  addImportEdges(input.imports, input.files, maps);
  const distanceByFile = buildDistanceMap(
    input.files,
    maps.adjacency,
    input.rootFile,
    maxDepth,
  );
  const nodes = buildGraphNodes(
    input.files,
    maps,
    input.symbolsByFile,
    distanceByFile,
  );
  const edges = buildGraphEdges(maps.adjacency, distanceByFile);

  return {
    nodes,
    edges,
    totalFiles: nodes.length,
    totalImports: edges.length,
  };
}
