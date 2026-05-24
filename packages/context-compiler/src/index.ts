export { getContextCompilerCapabilities } from "./capabilities";
export { formatContextIrForProvider } from "./contextFormatter";
export { rankEmbeddingFallback } from "./embeddingFallback";
export { optimizeToolOutput } from "./toolOutputOptimizer";
export { optimizeReplacementPatch } from "./patchOptimizer";
export {
  benchmarkContextQuality,
  ContextQualityTelemetryBuffer,
  createContextQualityTelemetrySample,
  runContextQualityBenchmarkFixtures,
  summarizeContextQualityBenchmarks,
} from "./qualityBenchmark";
export { BackgroundContextIndexer } from "./backgroundContextIndexer";
export { BoundedContextWorkerPool } from "./workerPool";
export { createContextCompilerDebugSnapshot } from "./debugSnapshot";
export {
  getDefaultContextLanguageAdapters,
  resolveContextLanguageAdapter,
} from "./languageAdapters";
export { createContextGraphSnapshot } from "./graphSnapshot";
export {
  CONTEXT_COMPILER_CACHE_STRATEGY,
  createContextCacheFileMetadata,
  createContextCacheGraphEdges,
  createContextCacheSummaries,
  createContextCacheSnapshot,
  getContextCompilerCacheStrategy,
  hashWorkspaceFileContent,
} from "./cacheStrategy";
export { FallbackContextCompiler } from "./fallbackContextCompiler";
export {
  createContextCompiler,
  NativeContextCompiler,
} from "./nativeContextCompiler";
export { isNodeSQLiteRuntimeAvailable } from "./sqliteContextCacheStore";
export {
  getNativeArtifactCandidates,
  getNativeTarget,
  nativeArtifactName,
  NATIVE_CONTEXT_COMPILER_TARGETS,
} from "./nativeTargets";
export type {
  NativeContextCompilerTarget,
  NativeTargetEnvironment,
} from "./nativeTargets";
export type {
  BuildContextIrRequest,
  CompiledContext,
  ContextBudget,
  ContextCacheFileMetadata,
  ContextCacheGraphEdge,
  ContextCacheSnapshot,
  ContextCacheStrategy,
  ContextCacheSummary,
  ContextCompiler,
  ContextCompilerCapabilities,
  ContextCompilerDebugEvidenceItem,
  ContextCompilerDebugFeature,
  ContextCompilerDebugSnapshot,
  ContextCompilerDebugSnapshotRequest,
  ContextCompilerFeatureCapability,
  ContextCompilerMetrics,
  ContextCompilerOptions,
  ContextDiagnostic,
  ContextFile,
  ContextIR,
  ContextLanguageAdapter,
  ContextLanguageAdapterResolution,
  ContextQualityBenchmarkExpectation,
  ContextQualityBenchmarkFixture,
  ContextQualityBenchmarkFixtureReport,
  ContextQualityBenchmarkRequest,
  ContextQualityBenchmarkResult,
  ContextQualityBenchmarkSample,
  ContextQualityBenchmarkSummary,
  ContextQualityDiagnosticExpectation,
  ContextQualityMissingEvidence,
  ContextQualityRuntimeOutcome,
  ContextQualityTelemetrySampleRequest,
  ContextReason,
  ContextScoreFactor,
  ContextSelectionExplanation,
  ContextSummary,
  ContextSymbol,
  ContextTask,
  ContextWorkspace,
  ContextWorkerPoolOptions,
  ContextWorkerPoolSnapshot,
  ContextWorkerTask,
  EmbeddingFallbackCandidate,
  EmbeddingFallbackMatch,
  EmbeddingFallbackRequest,
  IndexSummary,
  OmittedContextItem,
  PatchOptimizationRequest,
  PatchOptimizationResult,
  SourceRange,
  ToolOutputOptimizationRequest,
  ToolOutputOptimizationResult,
  WorkspaceFileInput,
  BackgroundContextIndexerOptions,
  BackgroundContextIndexerSnapshot,
  WorkspaceGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
} from "./types";
