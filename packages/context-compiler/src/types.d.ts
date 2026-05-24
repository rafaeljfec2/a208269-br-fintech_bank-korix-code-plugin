export interface SourceRange {
  readonly startLine: number;
  readonly startColumn?: number;
  readonly endLine: number;
  readonly endColumn?: number;
}

export interface ContextReason {
  readonly code: string;
  readonly detail?: string;
}

export interface ContextScoreFactor {
  readonly name:
    | "active_editor_proximity"
    | "symbol_match"
    | "dependency_proximity"
    | "diagnostics_relevance"
    | "git_activity"
    | "open_tab_or_recency"
    | "path_similarity"
    | "legacy_context_priority";
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface ContextDiagnostic {
  readonly path: string;
  readonly message: string;
  readonly severity?: "error" | "warning" | "information" | "hint";
  readonly range?: SourceRange;
}

export interface ContextTask {
  readonly userPrompt: string;
  readonly activeFile?: string;
  readonly activeSelection?: SourceRange;
  readonly mentionedSymbols: readonly string[];
  readonly constraints: readonly string[];
}

export interface ContextWorkspace {
  readonly root: string;
  readonly languageHints: readonly string[];
  readonly openFiles: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface ContextBudget {
  readonly maxTokens: number;
  readonly estimatedTokens: number;
  readonly tokensBeforeOptimization: number;
}

export interface ContextSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly score: number;
  readonly scoreFactors: readonly ContextScoreFactor[];
  readonly reasons: readonly ContextReason[];
  readonly contentMode: "source" | "signature" | "summary";
  readonly content: string;
  readonly dependencies: readonly string[];
  readonly estimatedTokens: number;
}

export interface ContextFile {
  readonly path: string;
  readonly score: number;
  readonly scoreFactors: readonly ContextScoreFactor[];
  readonly includedMode: "full" | "partial" | "metadata";
  readonly reasons: readonly ContextReason[];
  readonly estimatedTokens: number;
  readonly content?: string;
}

export interface CompiledContext {
  readonly symbols: readonly ContextSymbol[];
  readonly files: readonly ContextFile[];
  readonly summaries: readonly ContextSummary[];
  readonly diagnostics: readonly ContextDiagnostic[];
}

export interface ContextSummary {
  readonly id: string;
  readonly kind: "file";
  readonly path: string;
  readonly sourceHash: string;
  readonly summary: string;
  readonly estimatedTokens: number;
  readonly reasons: readonly ContextReason[];
}

export interface OmittedContextItem {
  readonly id: string;
  readonly kind: "file" | "symbol" | "diagnostic";
  readonly path?: string;
  readonly score: number;
  readonly reason:
    | "low_score"
    | "budget_exceeded"
    | "duplicate"
    | "unsupported_language"
    | "external_dependency";
}

export interface ContextCompilerMetrics {
  readonly contextBuildLatencyMs: number;
  readonly selectedFilesCount: number;
  readonly selectedSymbolsCount: number;
  readonly selectedDiagnosticsCount: number;
  readonly selectedRelevantSymbolsCount: number;
  readonly legacyBaselineTokens: number;
  readonly tokenSavingsPercent: number;
  readonly contextValuePerToken: number;
  readonly cacheHitRatio: number;
}

export interface ContextCacheStrategy {
  readonly contentHashAlgorithm: "fnv1a32-utf16" | "fnv1a64-utf8";
  readonly parserVersion: string;
  readonly strategyVersion: string;
}

export interface ContextCacheFileMetadata {
  readonly path: string;
  readonly contentHash: string;
  readonly parserVersion: string;
  readonly strategyVersion: string;
  readonly language?: string;
  readonly lastModified?: number;
  readonly estimatedTokens: number;
}

export interface ContextCacheGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: "import";
}

export interface ContextCacheSummary {
  readonly id: string;
  readonly kind: "file";
  readonly path: string;
  readonly sourceHash: string;
  readonly summary: string;
  readonly estimatedTokens: number;
  readonly reasonCodes: readonly string[];
}

export interface ContextCacheSnapshot {
  readonly version: "0.1";
  readonly strategy: ContextCacheStrategy;
  readonly files: readonly ContextCacheFileMetadata[];
  readonly graphEdges?: readonly ContextCacheGraphEdge[];
  readonly summaries?: readonly ContextCacheSummary[];
}

export interface ContextIR {
  readonly version: "0.1";
  readonly task: ContextTask;
  readonly workspace: ContextWorkspace;
  readonly budget: ContextBudget;
  readonly context: CompiledContext;
  readonly omitted: readonly OmittedContextItem[];
  readonly metrics: ContextCompilerMetrics;
}

export interface WorkspaceFileInput {
  readonly path: string;
  readonly content: string;
  readonly language?: string;
  readonly lastModified?: number;
  readonly selectionPriority?: number;
}

export interface BuildContextIrRequest {
  readonly userPrompt: string;
  readonly workspaceRoot: string;
  readonly activeFile?: string;
  readonly activeSelection?: SourceRange;
  readonly openFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly mentionedSymbols: readonly string[];
  readonly diagnostics: readonly ContextDiagnostic[];
  readonly maxTokens: number;
  readonly files: readonly WorkspaceFileInput[];
}

export interface ContextSelectionExplanation {
  readonly selectedFiles: readonly ContextFile[];
  readonly selectedSymbols: readonly ContextSymbol[];
  readonly omitted: readonly OmittedContextItem[];
  readonly metrics: ContextCompilerMetrics;
}

export interface ContextCompilerOptions {
  readonly maxTokens?: number;
  readonly cacheDatabasePath?: string;
}

export interface IndexSummary {
  readonly indexedFiles: number;
  readonly indexedSymbols: number;
}

export interface ContextCompiler {
  initialize(root: string, options?: ContextCompilerOptions): Promise<void>;
  indexWorkspace(files: readonly WorkspaceFileInput[]): Promise<IndexSummary>;
  updateFile(file: WorkspaceFileInput): Promise<IndexSummary>;
  removeFile(path: string): Promise<void>;
  buildContextIr(request: BuildContextIrRequest): Promise<ContextIR>;
  explainSelection(
    request: BuildContextIrRequest,
  ): Promise<ContextSelectionExplanation>;
  dispose(): void;
}

export interface ToolOutputOptimizationRequest {
  readonly output: string;
  readonly maxCharacters: number;
  readonly command?: string;
  readonly diagnostics?: readonly ContextDiagnostic[];
}

export interface ToolOutputOptimizationResult {
  readonly optimizedOutput: string;
  readonly originalCharacters: number;
  readonly optimizedCharacters: number;
  readonly omittedCharacters: number;
  readonly omittedLines: number;
  readonly reasons: readonly ContextReason[];
}

export interface PatchOptimizationRequest {
  readonly path: string;
  readonly originalContent: string;
  readonly modifiedContent: string;
  readonly contextLines?: number;
}

export interface PatchOptimizationResult {
  readonly changed: boolean;
  readonly patch?: string;
  readonly search?: string;
  readonly replace?: string;
  readonly originalCharacters: number;
  readonly patchCharacters: number;
  readonly reasons: readonly ContextReason[];
}

export interface EmbeddingFallbackCandidate {
  readonly id: string;
  readonly path?: string;
  readonly vector: readonly number[];
  readonly metadata?: string;
}

export interface EmbeddingFallbackRequest {
  readonly queryVector: readonly number[];
  readonly candidates: readonly EmbeddingFallbackCandidate[];
  readonly maxResults?: number;
  readonly minScore?: number;
}

export interface EmbeddingFallbackMatch {
  readonly id: string;
  readonly path?: string;
  readonly score: number;
  readonly metadata?: string;
  readonly reasons: readonly ContextReason[];
}

export interface ContextCompilerFeatureCapability {
  readonly name: string;
  readonly status: "stable" | "experimental" | "planned";
  readonly detail: string;
}

export interface ContextCompilerCapabilities {
  readonly packageName: "@korix/context-compiler";
  readonly packageVersion: string;
  readonly contextIrVersion: "0.1";
  readonly features: readonly ContextCompilerFeatureCapability[];
}

export interface ContextQualityDiagnosticExpectation {
  readonly path?: string;
  readonly messageIncludes?: string;
  readonly severity?: "error" | "warning" | "information" | "hint";
}

export interface ContextQualityBenchmarkExpectation {
  readonly requiredFiles?: readonly string[];
  readonly requiredSymbols?: readonly string[];
  readonly requiredDiagnostics?: readonly ContextQualityDiagnosticExpectation[];
  readonly baselineTokens?: number;
  readonly minTokenSavingsPercent?: number;
  readonly minContextValuePerToken?: number;
}

export interface ContextQualityMissingEvidence {
  readonly kind: "file" | "symbol" | "diagnostic" | "metric";
  readonly id: string;
  readonly detail?: string;
}

export interface ContextQualityBenchmarkRequest {
  readonly contextIr: ContextIR;
  readonly expectation?: ContextQualityBenchmarkExpectation;
}

export interface ContextQualityBenchmarkResult {
  readonly passed: boolean;
  readonly compiledTokens: number;
  readonly baselineTokens: number;
  readonly tokenSavingsPercent: number;
  readonly expectedEvidenceCount: number;
  readonly matchedEvidenceCount: number;
  readonly evidenceCoveragePercent: number;
  readonly contextValuePerToken: number;
  readonly missingEvidence: readonly ContextQualityMissingEvidence[];
  readonly reasons: readonly ContextReason[];
}

export interface ContextQualityBenchmarkSample {
  readonly id: string;
  readonly result: ContextQualityBenchmarkResult;
  readonly baselinePatchAccepted?: boolean;
  readonly compiledPatchAccepted?: boolean;
  readonly baselineTaskCompleted?: boolean;
  readonly compiledTaskCompleted?: boolean;
}

export interface ContextQualityRuntimeOutcome {
  readonly patchAccepted?: boolean;
  readonly taskCompleted?: boolean;
}

export interface ContextQualityTelemetrySampleRequest {
  readonly id: string;
  readonly contextIr: ContextIR;
  readonly expectation?: ContextQualityBenchmarkExpectation;
  readonly baselineOutcome?: ContextQualityRuntimeOutcome;
  readonly compiledOutcome?: ContextQualityRuntimeOutcome;
}

export interface ContextQualityBenchmarkFixture {
  readonly id: string;
  readonly contextIr: ContextIR;
  readonly expectation?: ContextQualityBenchmarkExpectation;
  readonly baselineOutcome?: ContextQualityRuntimeOutcome;
  readonly compiledOutcome?: ContextQualityRuntimeOutcome;
}

export interface ContextQualityBenchmarkSummary {
  readonly samplesCount: number;
  readonly passedSamplesCount: number;
  readonly failedSamplesCount: number;
  readonly averageTokenSavingsPercent: number;
  readonly averageEvidenceCoveragePercent: number;
  readonly averageContextValuePerToken: number;
  readonly patchOutcomeSamplesCount: number;
  readonly baselinePatchAcceptRatePercent: number;
  readonly compiledPatchAcceptRatePercent: number;
  readonly patchAcceptRateDeltaPercent: number;
  readonly taskOutcomeSamplesCount: number;
  readonly baselineTaskCompletionRatePercent: number;
  readonly compiledTaskCompletionRatePercent: number;
  readonly taskCompletionRateDeltaPercent: number;
  readonly reasons: readonly ContextReason[];
}

export interface ContextQualityBenchmarkFixtureReport {
  readonly passed: boolean;
  readonly samples: readonly ContextQualityBenchmarkSample[];
  readonly summary: ContextQualityBenchmarkSummary;
  readonly failedFixtureIds: readonly string[];
  readonly reasons: readonly ContextReason[];
}

export type ContextWorkerTask<T> = () => Promise<T>;

export interface ContextWorkerPoolOptions {
  readonly concurrency: number;
  readonly maxQueuedTasks: number;
}

export interface ContextWorkerPoolSnapshot {
  readonly runningTasks: number;
  readonly queuedTasks: number;
  readonly acceptedTasks: number;
  readonly rejectedTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly disposed: boolean;
}

export interface BackgroundContextIndexerOptions {
  readonly workerPool: ContextWorkerPoolOptions;
}

export interface BackgroundContextIndexerSnapshot {
  readonly workerPool: ContextWorkerPoolSnapshot;
}

export interface ContextCompilerDebugFeature {
  readonly name: string;
  readonly status: "stable" | "experimental" | "planned";
}

export interface ContextCompilerDebugEvidenceItem {
  readonly id: string;
  readonly kind: "file" | "symbol" | "summary";
  readonly path: string;
  readonly score?: number;
  readonly estimatedTokens: number;
  readonly mode: string;
  readonly reasonCodes: readonly string[];
}

export interface ContextCompilerDebugSnapshotRequest {
  readonly contextIr: ContextIR;
  readonly capabilities?: ContextCompilerCapabilities;
  readonly workerPool?: ContextWorkerPoolSnapshot;
  readonly qualitySummary?: ContextQualityBenchmarkSummary;
  readonly maxItems?: number;
}

export interface ContextCompilerDebugSnapshot {
  readonly contextIrVersion: "0.1";
  readonly features: readonly ContextCompilerDebugFeature[];
  readonly budget: ContextBudget;
  readonly metrics: ContextCompilerMetrics;
  readonly selectedFilesCount: number;
  readonly selectedSymbolsCount: number;
  readonly summariesCount: number;
  readonly diagnosticsCount: number;
  readonly omittedCount: number;
  readonly topEvidence: readonly ContextCompilerDebugEvidenceItem[];
  readonly workerPool?: ContextWorkerPoolSnapshot;
  readonly qualitySummary?: ContextQualityBenchmarkSummary;
}

export interface ContextLanguageAdapter {
  readonly languageId: string;
  readonly extensions: readonly string[];
  readonly status: "supported" | "planned";
  readonly parser: "tree-sitter" | "text" | "external";
  readonly detail: string;
}

export interface ContextLanguageAdapterResolution {
  readonly adapter?: ContextLanguageAdapter;
  readonly reasons: readonly ContextReason[];
}

export interface WorkspaceGraphNode {
  readonly path: string;
  readonly imports: readonly string[];
  readonly importedBy: readonly string[];
  readonly symbols: readonly string[];
  readonly distance?: number;
}

export interface WorkspaceGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: "import" | "symbol";
}

export interface WorkspaceGraph {
  readonly nodes: readonly WorkspaceGraphNode[];
  readonly edges: readonly WorkspaceGraphEdge[];
  readonly totalFiles: number;
  readonly totalImports: number;
}
