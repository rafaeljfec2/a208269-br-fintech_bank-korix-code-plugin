import { describe, expect, it, vi } from "vitest";
import { buildEvidencePack } from "./chatParticipantSupport";
import type { ContextEngine } from "../context/contextEngine";
import type { EvidenceRequest } from "../core/runtime/thinking";

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
      selection: {
        start: { line: 1, character: 0 },
        end: { line: 2, character: 0 },
        text: "login",
      },
      openFiles: ["/workspace/src/login.ts"],
    },
  };
}

describe("buildEvidencePack", () => {
  it("builds evidence through ContextIR and preserves workspace metadata", async () => {
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

    const evidence = await buildEvidencePack(
      createRequest(),
      contextEngine as ContextEngine,
    );

    expect(buildContextIr).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: "fix login",
        workspaceRoot: "/workspace",
        currentFile: "/workspace/src/login.ts",
        openFiles: ["/workspace/src/login.ts"],
        mentionedSymbols: ["login"],
        tokenBudget: 24000,
      }),
    );
    expect(evidence.providerContext).toBe("formatted context");
    expect(evidence.items).toEqual([
      {
        path: "/workspace/src/login.ts",
        priority: 10,
        tokenCount: 10,
      },
    ]);
  });
});
