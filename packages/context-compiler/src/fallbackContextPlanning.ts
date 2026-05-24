import {
  CONTEXT_COMPILER_CACHE_STRATEGY,
  hashWorkspaceFileContent,
} from "./cacheStrategy";
import { extractLightweightLanguageSymbols } from "./lightweightLanguageParser";
import type {
  BuildContextIrRequest,
  ContextFile,
  ContextSummary,
  ContextSymbol,
  WorkspaceFileInput,
} from "./types";

export interface FallbackCacheEntry {
  readonly contentHash: string;
  readonly parserVersion: string;
  readonly strategyVersion: string;
}

interface PackedContext {
  readonly files: readonly ContextFile[];
  readonly symbols: readonly ContextSymbol[];
  readonly estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarizeFile(file: WorkspaceFileInput): ContextSummary {
  const meaningfulLines = file.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
  const summary =
    meaningfulLines.length > 0
      ? meaningfulLines.join("\n")
      : `Empty or whitespace-only file: ${file.path}`;

  return {
    id: `summary:${file.path}`,
    kind: "file",
    path: file.path,
    sourceHash: hashWorkspaceFileContent(file.content),
    summary,
    estimatedTokens: estimateTokens(summary),
    reasons: [{ code: "budget_summary" }],
  };
}

export function cacheEntry(file: WorkspaceFileInput): FallbackCacheEntry {
  return {
    contentHash: hashWorkspaceFileContent(file.content),
    parserVersion: CONTEXT_COMPILER_CACHE_STRATEGY.parserVersion,
    strategyVersion: CONTEXT_COMPILER_CACHE_STRATEGY.strategyVersion,
  };
}

export function isCacheHit(
  entry: FallbackCacheEntry | undefined,
  file: WorkspaceFileInput,
): boolean {
  if (entry === undefined) {
    return false;
  }

  const current = cacheEntry(file);
  return (
    entry.contentHash === current.contentHash &&
    entry.parserVersion === current.parserVersion &&
    entry.strategyVersion === current.strategyVersion
  );
}

export function calculateTokenSavings(before: number, after: number): number {
  if (before <= 0) {
    return 0;
  }

  return Math.max(0, ((before - after) / before) * 100);
}

export function scoreFile(
  file: WorkspaceFileInput,
  request: BuildContextIrRequest,
  dependencyTargets: ReadonlySet<string>,
): ContextFile {
  const isActive = request.activeFile === file.path;
  const isOpen = request.openFiles.includes(file.path);
  const isChanged = request.changedFiles.includes(file.path);
  const isDirectDependency = dependencyTargets.has(file.path);
  const legacyPriority = file.selectionPriority ?? 0;
  const normalizedLegacyPriority = normalizeScore(legacyPriority);
  const score =
    legacyPriority +
    (isActive ? 1 : 0) +
    (isOpen ? 0.5 : 0) +
    (isChanged ? 0.5 : 0) +
    (isDirectDependency ? 0.4 : 0);

  return {
    path: file.path,
    score,
    scoreFactors: [
      {
        name: "active_editor_proximity",
        value: isActive ? 1 : 0,
        weight: 0.25,
        contribution: isActive ? 0.25 : 0,
      },
      {
        name: "open_tab_or_recency",
        value: isOpen || isChanged ? 1 : 0,
        weight: 0.1,
        contribution: isOpen || isChanged ? 0.1 : 0,
      },
      {
        name: "legacy_context_priority",
        value: normalizedLegacyPriority,
        weight: 1,
        contribution: normalizedLegacyPriority,
      },
      {
        name: "dependency_proximity",
        value: isDirectDependency ? 1 : 0,
        weight: 0.4,
        contribution: isDirectDependency ? 0.4 : 0,
      },
    ],
    includedMode: "full",
    reasons: [
      ...(legacyPriority > 0 ? [{ code: "legacy_context_window" }] : []),
      ...(isActive ? [{ code: "active_file" }] : []),
      ...(isOpen ? [{ code: "open_file" }] : []),
      ...(isChanged ? [{ code: "changed_file" }] : []),
      ...(isDirectDependency ? [{ code: "direct_dependency" }] : []),
    ],
    estimatedTokens: estimateTokens(file.content),
    content: file.content,
  };
}

export function selectedSymbols(
  selectedFiles: readonly ContextFile[],
  candidateFiles: readonly WorkspaceFileInput[],
  request: BuildContextIrRequest,
): readonly ContextSymbol[] {
  const selectedFilePaths = new Set(selectedFiles.map((file) => file.path));
  const mentionedSymbols = new Set(request.mentionedSymbols);

  const symbols = candidateFiles
    .filter((file) => selectedFilePaths.has(file.path))
    .flatMap((file) => extractLightweightLanguageSymbols(file))
    .filter(
      (symbol) =>
        symbol.file === request.activeFile || mentionedSymbols.has(symbol.name),
    )
    .map((symbol) => ({
      ...symbol,
      score: mentionedSymbols.has(symbol.name) ? 1 : symbol.score,
      reasons: [
        ...symbol.reasons,
        ...(mentionedSymbols.has(symbol.name)
          ? [{ code: "mentioned_symbol", detail: symbol.name }]
          : []),
        ...(symbol.file === request.activeFile
          ? [{ code: "active_file_symbol" }]
          : []),
      ],
    }));

  return [...pruneOverlappingSymbols(symbols, mentionedSymbols)].sort(
    (left, right) =>
      Number(mentionedSymbols.has(right.name)) -
        Number(mentionedSymbols.has(left.name)) ||
      right.score - left.score ||
      left.file.localeCompare(right.file) ||
      left.range.startLine - right.range.startLine,
  );
}

export function packContextWithinBudget(
  selectedFiles: readonly ContextFile[],
  summaries: readonly ContextSummary[],
  selectedSymbols: readonly ContextSymbol[],
  maxTokens: number,
): PackedContext {
  let symbols = [...selectedSymbols];
  let files = compactFilesWithSymbolChunks(selectedFiles, symbols);
  let estimatedTokens = contextTokenTotal(files, summaries, symbols);

  while (estimatedTokens > maxTokens && symbols.length > 0) {
    symbols = symbols.slice(0, -1);
    files = compactFilesWithSymbolChunks(selectedFiles, symbols);
    estimatedTokens = contextTokenTotal(files, summaries, symbols);
  }

  return {
    files,
    symbols,
    estimatedTokens,
  };
}

function normalizeScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function containsSymbolRange(
  container: ContextSymbol,
  nested: ContextSymbol,
): boolean {
  return (
    container.file === nested.file &&
    container.id !== nested.id &&
    container.range.startLine <= nested.range.startLine &&
    container.range.endLine >= nested.range.endLine
  );
}

function pruneOverlappingSymbols(
  symbols: readonly ContextSymbol[],
  mentionedSymbols: ReadonlySet<string>,
): readonly ContextSymbol[] {
  return symbols.filter((symbol) => {
    const symbolMentioned = mentionedSymbols.has(symbol.name);

    return !symbols.some((other) => {
      const otherMentioned = mentionedSymbols.has(other.name);

      if (containsSymbolRange(symbol, other)) {
        if (symbolMentioned && !otherMentioned) {
          return false;
        }

        return true;
      }

      if (containsSymbolRange(other, symbol)) {
        return otherMentioned && !symbolMentioned;
      }

      return false;
    });
  });
}

function metadataFile(file: ContextFile): ContextFile {
  return {
    ...file,
    includedMode: "metadata",
    estimatedTokens: 0,
    content: undefined,
  };
}

function compactFilesWithSymbolChunks(
  files: readonly ContextFile[],
  symbols: readonly ContextSymbol[],
): readonly ContextFile[] {
  const filesWithSymbols = new Set(symbols.map((symbol) => symbol.file));
  return files.map((file) =>
    filesWithSymbols.has(file.path) ? metadataFile(file) : file,
  );
}

function contextTokenTotal(
  files: readonly ContextFile[],
  summaries: readonly ContextSummary[],
  symbols: readonly ContextSymbol[],
): number {
  return (
    files.reduce((total, file) => total + file.estimatedTokens, 0) +
    summaries.reduce((total, summary) => total + summary.estimatedTokens, 0) +
    symbols.reduce((total, symbol) => total + symbol.estimatedTokens, 0)
  );
}
