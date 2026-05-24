import type {
  ContextDiagnostic,
  ContextQualityBenchmarkRequest,
  ContextQualityBenchmarkResult,
  ContextQualityBenchmarkSample,
  ContextQualityBenchmarkSummary,
  ContextQualityBenchmarkFixture,
  ContextQualityBenchmarkFixtureReport,
  ContextQualityDiagnosticExpectation,
  ContextQualityMissingEvidence,
  ContextQualityTelemetrySampleRequest,
  ContextReason,
} from "./types";

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function tokenSavingsPercent(
  baselineTokens: number,
  compiledTokens: number,
): number {
  if (baselineTokens <= 0) {
    return 0;
  }

  return ((baselineTokens - compiledTokens) / baselineTokens) * 100;
}

function evidenceCoveragePercent(expected: number, matched: number): number {
  if (expected === 0) {
    return 100;
  }

  return (matched / expected) * 100;
}

function average(
  samples: readonly ContextQualityBenchmarkSample[],
  value: (sample: ContextQualityBenchmarkSample) => number,
): number {
  if (samples.length === 0) {
    return 0;
  }

  return (
    samples.reduce((total, sample) => total + value(sample), 0) / samples.length
  );
}

function ratePercent(matches: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return (matches / total) * 100;
}

interface OutcomeCounts {
  readonly samples: number;
  readonly baselineMatches: number;
  readonly compiledMatches: number;
}

function countPairedOutcomes(
  samples: readonly ContextQualityBenchmarkSample[],
  baseline: (sample: ContextQualityBenchmarkSample) => boolean | undefined,
  compiled: (sample: ContextQualityBenchmarkSample) => boolean | undefined,
): OutcomeCounts {
  return samples.reduce<OutcomeCounts>(
    (counts, sample) => {
      const baselineValue = baseline(sample);
      const compiledValue = compiled(sample);
      if (baselineValue === undefined || compiledValue === undefined) {
        return counts;
      }

      return {
        samples: counts.samples + 1,
        baselineMatches:
          counts.baselineMatches + (baselineValue === true ? 1 : 0),
        compiledMatches:
          counts.compiledMatches + (compiledValue === true ? 1 : 0),
      };
    },
    {
      samples: 0,
      baselineMatches: 0,
      compiledMatches: 0,
    },
  );
}

function diagnosticMatches(
  diagnostic: ContextDiagnostic,
  expectation: ContextQualityDiagnosticExpectation,
): boolean {
  if (expectation.path !== undefined && diagnostic.path !== expectation.path) {
    return false;
  }

  if (
    expectation.severity !== undefined &&
    diagnostic.severity !== expectation.severity
  ) {
    return false;
  }

  if (
    expectation.messageIncludes !== undefined &&
    !diagnostic.message.includes(expectation.messageIncludes)
  ) {
    return false;
  }

  return true;
}

function diagnosticExpectationId(
  expectation: ContextQualityDiagnosticExpectation,
): string {
  return [
    expectation.path ?? "*",
    expectation.severity ?? "*",
    expectation.messageIncludes ?? "*",
  ].join(":");
}

export function benchmarkContextQuality(
  request: ContextQualityBenchmarkRequest,
): ContextQualityBenchmarkResult {
  const expectation = request.expectation ?? {};
  const compiledTokens = finiteNonNegative(
    request.contextIr.budget.estimatedTokens,
  );
  const baselineTokens = finiteNonNegative(
    expectation.baselineTokens ??
      request.contextIr.metrics.legacyBaselineTokens ??
      request.contextIr.budget.tokensBeforeOptimization,
  );
  const selectedFiles = new Set([
    ...request.contextIr.context.files.map((file) => file.path),
    ...request.contextIr.context.summaries.map((summary) => summary.path),
  ]);
  const selectedSymbols = new Set(
    request.contextIr.context.symbols.flatMap((symbol) => [
      symbol.id,
      symbol.name,
    ]),
  );
  const missingEvidence: ContextQualityMissingEvidence[] = [];

  for (const path of expectation.requiredFiles ?? []) {
    if (!selectedFiles.has(path)) {
      missingEvidence.push({ kind: "file", id: path });
    }
  }

  for (const symbol of expectation.requiredSymbols ?? []) {
    if (!selectedSymbols.has(symbol)) {
      missingEvidence.push({ kind: "symbol", id: symbol });
    }
  }

  for (const diagnostic of expectation.requiredDiagnostics ?? []) {
    if (
      !request.contextIr.context.diagnostics.some((selectedDiagnostic) =>
        diagnosticMatches(selectedDiagnostic, diagnostic),
      )
    ) {
      missingEvidence.push({
        kind: "diagnostic",
        id: diagnosticExpectationId(diagnostic),
      });
    }
  }

  const savingsPercent = tokenSavingsPercent(baselineTokens, compiledTokens);
  const expectedEvidenceCount =
    (expectation.requiredFiles ?? []).length +
    (expectation.requiredSymbols ?? []).length +
    (expectation.requiredDiagnostics ?? []).length;
  const matchedEvidenceCount = expectedEvidenceCount - missingEvidence.length;
  const coveragePercent = evidenceCoveragePercent(
    expectedEvidenceCount,
    matchedEvidenceCount,
  );
  const contextValuePerToken =
    expectedEvidenceCount > 0 && compiledTokens > 0
      ? matchedEvidenceCount / compiledTokens
      : finiteNonNegative(request.contextIr.metrics.contextValuePerToken);

  if (
    expectation.minTokenSavingsPercent !== undefined &&
    savingsPercent < expectation.minTokenSavingsPercent
  ) {
    missingEvidence.push({
      kind: "metric",
      id: "tokenSavingsPercent",
      detail: `${savingsPercent} < ${expectation.minTokenSavingsPercent}`,
    });
  }

  if (
    expectation.minContextValuePerToken !== undefined &&
    contextValuePerToken < expectation.minContextValuePerToken
  ) {
    missingEvidence.push({
      kind: "metric",
      id: "contextValuePerToken",
      detail: `${contextValuePerToken} < ${expectation.minContextValuePerToken}`,
    });
  }

  const reasons: ContextReason[] =
    missingEvidence.length === 0
      ? [{ code: "quality_benchmark_passed" }]
      : [{ code: "quality_benchmark_failed" }];

  if (expectedEvidenceCount > 0) {
    reasons.push({
      code: "required_evidence_checked",
      detail: `${matchedEvidenceCount}/${expectedEvidenceCount}`,
    });
  }

  return {
    passed: missingEvidence.length === 0,
    compiledTokens,
    baselineTokens,
    tokenSavingsPercent: savingsPercent,
    expectedEvidenceCount,
    matchedEvidenceCount,
    evidenceCoveragePercent: coveragePercent,
    contextValuePerToken,
    missingEvidence,
    reasons,
  };
}

export function summarizeContextQualityBenchmarks(
  samples: readonly ContextQualityBenchmarkSample[],
): ContextQualityBenchmarkSummary {
  const passedSamplesCount = samples.filter(
    (sample) => sample.result.passed,
  ).length;
  const patchCounts = countPairedOutcomes(
    samples,
    (sample) => sample.baselinePatchAccepted,
    (sample) => sample.compiledPatchAccepted,
  );
  const taskCounts = countPairedOutcomes(
    samples,
    (sample) => sample.baselineTaskCompleted,
    (sample) => sample.compiledTaskCompleted,
  );
  const baselinePatchAcceptRatePercent = ratePercent(
    patchCounts.baselineMatches,
    patchCounts.samples,
  );
  const compiledPatchAcceptRatePercent = ratePercent(
    patchCounts.compiledMatches,
    patchCounts.samples,
  );
  const baselineTaskCompletionRatePercent = ratePercent(
    taskCounts.baselineMatches,
    taskCounts.samples,
  );
  const compiledTaskCompletionRatePercent = ratePercent(
    taskCounts.compiledMatches,
    taskCounts.samples,
  );

  return {
    samplesCount: samples.length,
    passedSamplesCount,
    failedSamplesCount: samples.length - passedSamplesCount,
    averageTokenSavingsPercent: average(
      samples,
      (sample) => sample.result.tokenSavingsPercent,
    ),
    averageEvidenceCoveragePercent: average(
      samples,
      (sample) => sample.result.evidenceCoveragePercent,
    ),
    averageContextValuePerToken: average(
      samples,
      (sample) => sample.result.contextValuePerToken,
    ),
    patchOutcomeSamplesCount: patchCounts.samples,
    baselinePatchAcceptRatePercent,
    compiledPatchAcceptRatePercent,
    patchAcceptRateDeltaPercent:
      compiledPatchAcceptRatePercent - baselinePatchAcceptRatePercent,
    taskOutcomeSamplesCount: taskCounts.samples,
    baselineTaskCompletionRatePercent,
    compiledTaskCompletionRatePercent,
    taskCompletionRateDeltaPercent:
      compiledTaskCompletionRatePercent - baselineTaskCompletionRatePercent,
    reasons:
      samples.length === 0
        ? [{ code: "quality_benchmark_summary_empty" }]
        : [{ code: "quality_benchmark_summary_computed" }],
  };
}

export function createContextQualityTelemetrySample(
  request: ContextQualityTelemetrySampleRequest,
): ContextQualityBenchmarkSample {
  return {
    id: request.id,
    result: benchmarkContextQuality({
      contextIr: request.contextIr,
      expectation: request.expectation,
    }),
    baselinePatchAccepted: request.baselineOutcome?.patchAccepted,
    compiledPatchAccepted: request.compiledOutcome?.patchAccepted,
    baselineTaskCompleted: request.baselineOutcome?.taskCompleted,
    compiledTaskCompleted: request.compiledOutcome?.taskCompleted,
  };
}

export function runContextQualityBenchmarkFixtures(
  fixtures: readonly ContextQualityBenchmarkFixture[],
): ContextQualityBenchmarkFixtureReport {
  const samples = fixtures.map((fixture) =>
    createContextQualityTelemetrySample({
      id: fixture.id,
      contextIr: fixture.contextIr,
      expectation: fixture.expectation,
      baselineOutcome: fixture.baselineOutcome,
      compiledOutcome: fixture.compiledOutcome,
    }),
  );
  const summary = summarizeContextQualityBenchmarks(samples);
  const failedFixtureIds = samples
    .filter((sample) => !sample.result.passed)
    .map((sample) => sample.id);
  const passed = samples.length > 0 && failedFixtureIds.length === 0;
  const reasons: ContextReason[] =
    samples.length === 0
      ? [{ code: "quality_benchmark_fixtures_empty" }]
      : passed
        ? [{ code: "quality_benchmark_fixtures_passed" }]
        : [
            {
              code: "quality_benchmark_fixtures_failed",
              detail: failedFixtureIds.join(", "),
            },
          ];

  return {
    passed,
    samples,
    summary,
    failedFixtureIds,
    reasons,
  };
}

export class ContextQualityTelemetryBuffer {
  private readonly collectedSamples: ContextQualityBenchmarkSample[] = [];

  record(
    request: ContextQualityTelemetrySampleRequest,
  ): ContextQualityBenchmarkSample {
    const sample = createContextQualityTelemetrySample(request);
    this.collectedSamples.push(sample);
    return sample;
  }

  samples(): readonly ContextQualityBenchmarkSample[] {
    return [...this.collectedSamples];
  }

  summarize(): ContextQualityBenchmarkSummary {
    return summarizeContextQualityBenchmarks(this.collectedSamples);
  }

  clear(): void {
    this.collectedSamples.length = 0;
  }
}
