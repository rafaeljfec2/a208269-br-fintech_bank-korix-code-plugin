import { describe, expect, it, vi } from "vitest";
import type { ContextEngine } from "../../context/contextEngine";
import type { EvidenceRequest } from "../../core/runtime/thinking";
import { RuntimeEventEmitter } from "../../core/runtime/runtimeEvents";
import { ContextQualityTelemetryBuffer } from "@korix/context-compiler";
import { AgentEvidencePackBuilder } from "./agentEvidencePackBuilder";
import { ContextQualityRuntimeTelemetry } from "./contextQualityRuntimeTelemetry";

function createRequest(): EvidenceRequest {
  return {
    message: "fix login",
    profile: {
      intent: "modify",
      riskLevel: "low",
      requiresWorkspaceEvidence: true,
      requiresToolUse: true,
      workspaceAccess: {
        requested: true,
        action: "read",
        explicit: true,
      },
      mentionedSymbols: ["login"],
      constraints: [],
      summary: "Fix login",
    },
    context: {
      mode: "agent",
      workspaceRoot: "/workspace",
      currentFile: "/workspace/src/login.ts",
      openFiles: ["/workspace/src/login.ts"],
    },
  };
}

describe("AgentExecutor evidence pack", () => {
  it("passes workspace metadata into ContextIR evidence building", async () => {
    const buildContextIr = vi.fn().mockResolvedValue({
      version: "0.1",
      task: {
        userPrompt: "fix login",
        activeFile: "/workspace/src/login.ts",
        mentionedSymbols: ["login"],
        constraints: [],
      },
      workspace: {
        root: "/workspace",
        languageHints: [],
        openFiles: ["/workspace/src/login.ts"],
        changedFiles: [],
      },
      budget: {
        maxTokens: 100,
        estimatedTokens: 10,
        tokensBeforeOptimization: 10,
      },
      context: {
        symbols: [],
        files: [
          {
            path: "/workspace/src/login.ts",
            score: 10,
            scoreFactors: [],
            includedMode: "full",
            reasons: [],
            estimatedTokens: 10,
            content: "export function login() { return true; }",
          },
        ],
        diagnostics: [],
      },
      omitted: [],
      metrics: {
        contextBuildLatencyMs: 0,
        selectedFilesCount: 1,
        selectedSymbolsCount: 0,
        selectedDiagnosticsCount: 0,
        selectedRelevantSymbolsCount: 0,
        legacyBaselineTokens: 10,
        tokenSavingsPercent: 0,
        contextValuePerToken: 0.1,
        cacheHitRatio: 0,
      },
    });
    const contextEngine: Pick<
      ContextEngine,
      "buildContextIr" | "formatContextIr"
    > = {
      buildContextIr,
      formatContextIr: () => "formatted context",
    };
    const recordContextIr = vi.fn();
    const builder = new AgentEvidencePackBuilder(
      contextEngine,
      recordContextIr,
    );

    const evidence = await builder.build(createRequest());

    expect(buildContextIr).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: "fix login",
        workspaceRoot: "/workspace",
        currentFile: "/workspace/src/login.ts",
        openFiles: ["/workspace/src/login.ts"],
      }),
    );
    expect(recordContextIr).toHaveBeenCalledOnce();
    expect(evidence.totalTokens).toBe(10);
    expect(evidence.providerContext).toBe("formatted context");
  });

  it("records context quality telemetry from observed runtime outcomes", () => {
    const contextIr = {
      version: "0.1",
      task: {
        userPrompt: "fix login",
        mentionedSymbols: ["login"],
        constraints: [],
      },
      workspace: {
        root: "/workspace",
        languageHints: [],
        openFiles: [],
        changedFiles: [],
      },
      budget: {
        maxTokens: 100,
        estimatedTokens: 10,
        tokensBeforeOptimization: 20,
      },
      context: {
        symbols: [],
        files: [],
        summaries: [],
        diagnostics: [],
      },
      omitted: [],
      metrics: {
        contextBuildLatencyMs: 0,
        selectedFilesCount: 0,
        selectedSymbolsCount: 0,
        selectedDiagnosticsCount: 0,
        selectedRelevantSymbolsCount: 0,
        legacyBaselineTokens: 20,
        tokenSavingsPercent: 50,
        contextValuePerToken: 0,
        cacheHitRatio: 0,
      },
    };
    const telemetry = new ContextQualityRuntimeTelemetry(
      { debug: vi.fn() },
      new RuntimeEventEmitter(),
      new ContextQualityTelemetryBuffer(),
    );
    telemetry.setContextIr(contextIr);

    telemetry.recordEvent({
      type: "tool_result",
      id: "edit-1",
      name: "EditFile",
      success: true,
      result: {
        appliedCount: 1,
        errorCount: 0,
        rollbackId: "rollback-1",
      },
      duration: 10,
      timestamp: 1,
    });
    telemetry.recordEvent({
      type: "tool_result",
      id: "edit-2",
      name: "EditFile",
      success: false,
      result: {
        appliedCount: 0,
        errorCount: 1,
        rollbackId: "",
      },
      duration: 10,
      timestamp: 2,
    });
    telemetry.recordEvent({
      type: "execution_complete",
      success: false,
      iterations: 2,
      metrics: {
        totalTokens: 0,
        totalToolCalls: 0,
        iterations: 2,
        duration: 1,
        checkpoints: 0,
        recoveries: 0,
        toolBreakdown: {},
        eventTimeline: [],
      },
      timestamp: 3,
    });

    expect(telemetry.summarize()).toMatchObject({
      samplesCount: 1,
      compiledPatchAcceptRatePercent: 0,
      compiledTaskCompletionRatePercent: 0,
    });
    expect(telemetry.summarize().samplesCount).toBe(1);
  });

  it("attaches context quality telemetry to runtime emitter events", () => {
    const eventEmitter = new RuntimeEventEmitter();
    const telemetry = new ContextQualityRuntimeTelemetry(
      { debug: vi.fn() },
      eventEmitter,
      new ContextQualityTelemetryBuffer(),
    );
    telemetry.setContextIr({
      version: "0.1",
      task: {
        userPrompt: "fix login",
        mentionedSymbols: [],
        constraints: [],
      },
      workspace: {
        root: "/workspace",
        languageHints: [],
        openFiles: [],
        changedFiles: [],
      },
      budget: {
        maxTokens: 100,
        estimatedTokens: 10,
        tokensBeforeOptimization: 20,
      },
      context: {
        symbols: [],
        files: [],
        summaries: [],
        diagnostics: [],
      },
      omitted: [],
      metrics: {
        contextBuildLatencyMs: 0,
        selectedFilesCount: 0,
        selectedSymbolsCount: 0,
        selectedDiagnosticsCount: 0,
        selectedRelevantSymbolsCount: 0,
        legacyBaselineTokens: 20,
        tokenSavingsPercent: 50,
        contextValuePerToken: 0,
        cacheHitRatio: 0,
      },
    });
    const detach = telemetry.attach();

    eventEmitter.emitEvent({
      type: "tool_result",
      id: "edit-1",
      name: "EditFile",
      success: true,
      result: {
        appliedCount: 1,
        errorCount: 0,
      },
      duration: 1,
      timestamp: 1,
    });
    eventEmitter.emitEvent({
      type: "execution_complete",
      success: true,
      iterations: 1,
      metrics: {
        totalTokens: 0,
        totalToolCalls: 0,
        iterations: 1,
        duration: 1,
        checkpoints: 0,
        recoveries: 0,
        toolBreakdown: {},
        eventTimeline: [],
      },
      timestamp: 2,
    });
    detach();

    expect(telemetry.samples()[0]).toMatchObject({
      compiledPatchAccepted: true,
      compiledTaskCompleted: true,
    });
    expect(telemetry.summarize()).toMatchObject({
      samplesCount: 1,
      patchOutcomeSamplesCount: 0,
      taskOutcomeSamplesCount: 0,
    });
  });
});
