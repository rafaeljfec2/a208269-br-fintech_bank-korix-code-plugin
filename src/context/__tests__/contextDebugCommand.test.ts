import { describe, expect, it } from "vitest";
import { formatContextCompilerDebugSnapshotMarkdown } from "../contextDebugCommand";
import type { ContextCompilerDebugSnapshot } from "@korix/context-compiler";

function createSnapshot(): ContextCompilerDebugSnapshot {
  return {
    contextIrVersion: "0.1",
    features: [
      {
        name: "context-ir",
        status: "stable",
      },
      {
        name: "debug-snapshots",
        status: "experimental",
      },
    ],
    budget: {
      maxTokens: 100,
      estimatedTokens: 20,
      tokensBeforeOptimization: 80,
    },
    metrics: {
      contextBuildLatencyMs: 3,
      selectedFilesCount: 1,
      selectedSymbolsCount: 1,
      selectedDiagnosticsCount: 0,
      selectedRelevantSymbolsCount: 1,
      legacyBaselineTokens: 80,
      tokenSavingsPercent: 75,
      contextValuePerToken: 0.05,
      cacheHitRatio: 0.5,
    },
    selectedFilesCount: 1,
    selectedSymbolsCount: 1,
    summariesCount: 0,
    diagnosticsCount: 0,
    omittedCount: 1,
    topEvidence: [
      {
        id: "symbol-login",
        kind: "symbol",
        path: "/workspace/src/login.ts",
        score: 1,
        estimatedTokens: 10,
        mode: "source",
        reasonCodes: ["active_file", "mentioned_symbol"],
      },
    ],
    qualitySummary: {
      samplesCount: 2,
      passedSamplesCount: 1,
      failedSamplesCount: 1,
      averageTokenSavingsPercent: 42,
      averageEvidenceCoveragePercent: 75,
      averageContextValuePerToken: 0.0125,
      patchOutcomeSamplesCount: 1,
      baselinePatchAcceptRatePercent: 0,
      compiledPatchAcceptRatePercent: 100,
      patchAcceptRateDeltaPercent: 100,
      taskOutcomeSamplesCount: 1,
      baselineTaskCompletionRatePercent: 0,
      compiledTaskCompletionRatePercent: 100,
      taskCompletionRateDeltaPercent: 100,
      reasons: [{ code: "quality_benchmark_summary_computed" }],
    },
  };
}

describe("context debug command formatting", () => {
  it("formats a compact markdown snapshot without source content", () => {
    const markdown =
      formatContextCompilerDebugSnapshotMarkdown(createSnapshot());

    expect(markdown).toContain("# Korix Context Selection");
    expect(markdown).toContain("- estimated tokens: 20");
    expect(markdown).toContain("- token savings: 75.0%");
    expect(markdown).toContain("## Quality");
    expect(markdown).toContain("- samples: 2");
    expect(markdown).toContain("- compiled patch accept rate: 100.0%");
    expect(markdown).toContain("- compiled task completion rate: 100.0%");
    expect(markdown).toContain("- symbol: `/workspace/src/login.ts`");
    expect(markdown).toContain("- reasons: active_file, mentioned_symbol");
    expect(markdown).toContain("- debug-snapshots: experimental");
    expect(markdown).not.toContain("function login");
  });
});
