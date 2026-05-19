import { describe, expect, it } from "vitest";
import { TaskAnalyzer } from "./TaskAnalyzer";
import type { ExecutionContext } from "../../types";

describe("TaskAnalyzer", () => {
  const context: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/repo",
    currentFile: "/repo/src/auth.ts",
    openFiles: ["/repo/src/auth.ts"],
  };

  it("should classify simple answer without workspace evidence", () => {
    const profile = new TaskAnalyzer().analyze("O que é async/await?", {
      ...context,
      currentFile: undefined,
      openFiles: [],
    });

    expect(profile.intent).toBe("answer");
    expect(profile.riskLevel).toBe("low");
    expect(profile.requiresWorkspaceEvidence).toBe(false);
  });

  it("should require workspace evidence for code-specific request", () => {
    const profile = new TaskAnalyzer().analyze(
      "Verifique esse arquivo e explique `AuthService`",
      context,
    );

    expect(profile.requiresWorkspaceEvidence).toBe(true);
    expect(profile.mentionedSymbols).toContain("AuthService");
  });

  it("should classify implementation as modification risk", () => {
    const profile = new TaskAnalyzer().analyze(
      "Implemente retry no login",
      context,
    );

    expect(profile.intent).toBe("modify");
    expect(profile.riskLevel).toBe("medium");
    expect(profile.requiresToolUse).toBe(true);
  });
});

