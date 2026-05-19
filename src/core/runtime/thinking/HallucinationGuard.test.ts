import { describe, expect, it } from "vitest";
import { HallucinationGuard } from "./HallucinationGuard";
import type { ThinkingRunProfile } from "./types";

describe("HallucinationGuard", () => {
  const profile: ThinkingRunProfile = {
    intent: "answer",
    riskLevel: "low",
    requiresWorkspaceEvidence: true,
    requiresToolUse: true,
    mentionedSymbols: [],
    constraints: [],
    summary: "workspace answer",
  };

  it("should warn when workspace evidence is missing", () => {
    const result = new HallucinationGuard().validate({
      profile,
      response: "Definitivamente esse arquivo faz autenticação.",
      observations: [],
    });

    expect(result.status).toBe("warning");
    expect(result.riskFlags).toContain("missing_workspace_evidence");
  });

  it("should pass when evidence is available", () => {
    const result = new HallucinationGuard().validate({
      profile,
      response: "O arquivo contém autenticação.",
      observations: [],
      evidence: {
        summary: "1 workspace item",
        providerContext: "auth.ts",
        items: [{ path: "auth.ts", priority: 1, tokenCount: 10 }],
        totalTokens: 10,
      },
    });

    expect(result.status).toBe("passed");
  });
});

