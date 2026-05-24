import type {
  ContextCompilerDebugEvidenceItem,
  ContextCompilerDebugSnapshot,
  ContextCompilerDebugSnapshotRequest,
} from "./types";

function maxItems(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 10;
  }

  return Math.max(0, Math.floor(value));
}

export function createContextCompilerDebugSnapshot(
  request: ContextCompilerDebugSnapshotRequest,
): ContextCompilerDebugSnapshot {
  const limit = maxItems(request.maxItems);
  const files: ContextCompilerDebugEvidenceItem[] =
    request.contextIr.context.files.map((file) => ({
      id: file.path,
      kind: "file",
      path: file.path,
      score: file.score,
      estimatedTokens: file.estimatedTokens,
      mode: file.includedMode,
      reasonCodes: file.reasons.map((reason) => reason.code),
    }));
  const symbols: ContextCompilerDebugEvidenceItem[] =
    request.contextIr.context.symbols.map((symbol) => ({
      id: symbol.id,
      kind: "symbol",
      path: symbol.file,
      score: symbol.score,
      estimatedTokens: symbol.estimatedTokens,
      mode: symbol.contentMode,
      reasonCodes: symbol.reasons.map((reason) => reason.code),
    }));
  const summaries: ContextCompilerDebugEvidenceItem[] =
    request.contextIr.context.summaries.map((summary) => ({
      id: summary.id,
      kind: "summary",
      path: summary.path,
      estimatedTokens: summary.estimatedTokens,
      mode: summary.kind,
      reasonCodes: summary.reasons.map((reason) => reason.code),
    }));

  return {
    contextIrVersion: request.contextIr.version,
    features:
      request.capabilities?.features.map((feature) => ({
        name: feature.name,
        status: feature.status,
      })) ?? [],
    budget: request.contextIr.budget,
    metrics: request.contextIr.metrics,
    selectedFilesCount: request.contextIr.context.files.length,
    selectedSymbolsCount: request.contextIr.context.symbols.length,
    summariesCount: request.contextIr.context.summaries.length,
    diagnosticsCount: request.contextIr.context.diagnostics.length,
    omittedCount: request.contextIr.omitted.length,
    topEvidence: [...symbols, ...files, ...summaries]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, limit),
    workerPool: request.workerPool,
    qualitySummary: request.qualitySummary,
  };
}
