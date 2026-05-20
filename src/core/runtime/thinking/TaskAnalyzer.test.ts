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

  it("should not treat common database option names as workspace symbols", () => {
    const profile = new TaskAnalyzer().analyze(
      "Qual banco de dados usar (PostgreSQL, MongoDB, MySQL, Redis) me dê 4 opções de escolha",
      context,
    );

    expect(profile.intent).toBe("answer");
    expect(profile.requiresWorkspaceEvidence).toBe(false);
    expect(profile.mentionedSymbols).toEqual([]);
  });

  it("should treat pasted JSON questions as direct evidence instead of workspace lookup", () => {
    const profile = new TaskAnalyzer().analyze(
      `que documento é esse {
        "entry": [{
          "changes": [{
            "value": {
              "statuses": [{
                "message_id": "wamid.test_123456789",
                "status": "delivered"
              }]
            }
          }]
        }]
      }`,
      context,
    );

    expect(profile.intent).toBe("answer");
    expect(profile.riskLevel).toBe("low");
    expect(profile.requiresWorkspaceEvidence).toBe(false);
    expect(profile.requiresToolUse).toBe(false);
    expect(profile.mentionedSymbols).toEqual([]);
  });

  it("should still detect dotted workspace symbols when a real symbol is present", () => {
    const profile = new TaskAnalyzer().analyze(
      "Explique `AuthService.findUser` neste projeto",
      context,
    );

    expect(profile.requiresWorkspaceEvidence).toBe(true);
    expect(profile.mentionedSymbols).toContain("AuthService.findUser");
  });

  it("should require tools for explicit workspace file reading requests", () => {
    const profile = new TaskAnalyzer().analyze(
      "faça leitura de tres arquivos aleatorios",
      context,
    );

    expect(profile.intent).toBe("answer");
    expect(profile.riskLevel).toBe("low");
    expect(profile.requiresWorkspaceEvidence).toBe(true);
    expect(profile.requiresToolUse).toBe(true);
  });

  it("should not collect workspace evidence in ask mode", () => {
    const profile = new TaskAnalyzer().analyze(
      "faça leitura de tres arquivos aleatorios",
      {
        ...context,
        mode: "ask",
      },
    );

    expect(profile.requiresWorkspaceEvidence).toBe(false);
    expect(profile.requiresToolUse).toBe(true);
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
