import * as vscode from "vscode";
import {
  createContextCompilerDebugSnapshot,
  getContextCompilerCapabilities,
  type ContextCompilerDebugEvidenceItem,
  type ContextCompilerDebugSnapshot,
  type ContextQualityBenchmarkSummary,
} from "@korix/context-compiler";
import type { Logger } from "../telemetry/logger";
import type { ContextEngine } from "./contextEngine";

function activeSelection(
  editor: vscode.TextEditor | undefined,
): { readonly file: string; readonly range: vscode.Range } | undefined {
  if (editor === undefined || editor.selection.isEmpty) {
    return undefined;
  }

  return {
    file: editor.document.uri.fsPath,
    range: editor.selection,
  };
}

function formatEvidence(item: ContextCompilerDebugEvidenceItem): string {
  const reasons =
    item.reasonCodes.length > 0 ? item.reasonCodes.join(", ") : "none";
  const score = item.score === undefined ? "n/a" : item.score.toFixed(3);

  return [
    `- ${item.kind}: \`${item.path}\``,
    `  - id: \`${item.id}\``,
    `  - mode: ${item.mode}`,
    `  - score: ${score}`,
    `  - estimated tokens: ${item.estimatedTokens}`,
    `  - reasons: ${reasons}`,
  ].join("\n");
}

function formatQualitySummary(
  summary: ContextQualityBenchmarkSummary | undefined,
): readonly string[] {
  if (summary === undefined) {
    return [];
  }

  return [
    "## Quality",
    "",
    `- samples: ${summary.samplesCount}`,
    `- passed samples: ${summary.passedSamplesCount}`,
    `- failed samples: ${summary.failedSamplesCount}`,
    `- average token savings: ${summary.averageTokenSavingsPercent.toFixed(1)}%`,
    `- average evidence coverage: ${summary.averageEvidenceCoveragePercent.toFixed(1)}%`,
    `- average context value per token: ${summary.averageContextValuePerToken.toFixed(6)}`,
    `- patch outcome samples: ${summary.patchOutcomeSamplesCount}`,
    `- compiled patch accept rate: ${summary.compiledPatchAcceptRatePercent.toFixed(1)}%`,
    `- task outcome samples: ${summary.taskOutcomeSamplesCount}`,
    `- compiled task completion rate: ${summary.compiledTaskCompletionRatePercent.toFixed(1)}%`,
    "",
  ];
}

export function formatContextCompilerDebugSnapshotMarkdown(
  snapshot: ContextCompilerDebugSnapshot,
): string {
  const features = snapshot.features
    .map((feature) => `- ${feature.name}: ${feature.status}`)
    .join("\n");
  const evidence =
    snapshot.topEvidence.length > 0
      ? snapshot.topEvidence.map(formatEvidence).join("\n")
      : "- none";

  return [
    "# Korix Context Selection",
    "",
    "## Budget",
    "",
    `- max tokens: ${snapshot.budget.maxTokens}`,
    `- estimated tokens: ${snapshot.budget.estimatedTokens}`,
    `- tokens before optimization: ${snapshot.budget.tokensBeforeOptimization}`,
    "",
    "## Metrics",
    "",
    `- build latency ms: ${snapshot.metrics.contextBuildLatencyMs}`,
    `- selected files: ${snapshot.selectedFilesCount}`,
    `- selected symbols: ${snapshot.selectedSymbolsCount}`,
    `- summaries: ${snapshot.summariesCount}`,
    `- diagnostics: ${snapshot.diagnosticsCount}`,
    `- omitted: ${snapshot.omittedCount}`,
    `- token savings: ${snapshot.metrics.tokenSavingsPercent.toFixed(1)}%`,
    `- context value per token: ${snapshot.metrics.contextValuePerToken.toFixed(6)}`,
    `- cache hit ratio: ${snapshot.metrics.cacheHitRatio.toFixed(3)}`,
    "",
    "## Top Evidence",
    "",
    evidence,
    "",
    ...formatQualitySummary(snapshot.qualitySummary),
    "## Features",
    "",
    features,
    "",
  ].join("\n");
}

export async function explainContextSelection(
  contextEngine: ContextEngine,
  logger: Logger,
  qualitySummary?: ContextQualityBenchmarkSummary,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const currentFile = editor?.document.uri.fsPath;
  const tokenBudget = vscode.workspace
    .getConfiguration("korix")
    .get<number>("contextTokenBudget", 180000);

  const contextIr = await contextEngine.buildContextIr({
    userPrompt: "Explain context selection",
    workspaceRoot,
    currentFile,
    openFiles: vscode.workspace.textDocuments.map(
      (document) => document.uri.fsPath,
    ),
    userSelection: activeSelection(editor),
    tokenBudget,
  });
  const snapshot = createContextCompilerDebugSnapshot({
    contextIr,
    capabilities: getContextCompilerCapabilities(),
    qualitySummary,
    maxItems: 10,
  });
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: formatContextCompilerDebugSnapshotMarkdown(snapshot),
  });

  await vscode.window.showTextDocument(document, { preview: false });
  logger.info("Opened context selection debug snapshot", {
    selectedFiles: snapshot.selectedFilesCount,
    selectedSymbols: snapshot.selectedSymbolsCount,
    omitted: snapshot.omittedCount,
  });
}
