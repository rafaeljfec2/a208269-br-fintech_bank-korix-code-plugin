import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "../../types";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { ToolUsePolicyResolver } from "./ToolUsePolicyResolver";

describe("ToolUsePolicyResolver", () => {
  const context: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/repo",
    currentFile: "/repo/src/auth.ts",
    openFiles: ["/repo/src/auth.ts"],
  };

  const resolve = (
    message: string,
    overrides: Partial<ExecutionContext> = {},
  ) => {
    const executionContext: ExecutionContext = {
      ...context,
      ...overrides,
      openFiles: overrides.openFiles ?? context.openFiles,
    };
    const profile = new TaskAnalyzer().analyze(message, executionContext);

    return new ToolUsePolicyResolver().resolve(
      message,
      profile,
      executionContext,
    );
  };

  it("should disable tools for general questions", () => {
    const policy = resolve("O que é async/await?", {
      currentFile: undefined,
      openFiles: [],
    });

    expect(policy).toEqual({
      mode: "none",
      allowedTools: [],
      evidenceRequired: false,
      allowPassiveEvidence: false,
      reason: "general",
    });
  });

  it("should use passive evidence and auto tools for current file explanations", () => {
    const policy = resolve("explique esse arquivo");

    expect(policy.mode).toBe("auto");
    expect(policy.reason).toBe("workspace_inspect");
    expect(policy.evidenceRequired).toBe(true);
    expect(policy.allowPassiveEvidence).toBe(true);
    expect(policy.allowedTools).toContain("ReadFile");
  });

  it("should require read tools for explicit project file reads", () => {
    const policy = resolve(
      "faça leitura e passe um resumo de tres arquivos do projeto",
    );

    expect(policy).toEqual({
      mode: "required",
      allowedTools: ["ListDirectory", "SearchFiles", "ReadFile", "FileChunks"],
      evidenceRequired: true,
      allowPassiveEvidence: false,
      reason: "workspace_read",
    });
  });

  it("should require read tools for capitalized explicit project file reads", () => {
    const policy = resolve("Leia tres arquivos do projeto");

    expect(policy.mode).toBe("required");
    expect(policy.reason).toBe("workspace_read");
    expect(policy.allowPassiveEvidence).toBe(false);
  });

  it("should require search tools for explicit symbol searches", () => {
    const policy = resolve("busque AuthService no projeto");

    expect(policy.mode).toBe("required");
    expect(policy.reason).toBe("workspace_search");
    expect(policy.allowPassiveEvidence).toBe(false);
    expect(policy.allowedTools).toContain("Grep");
    expect(policy.allowedTools).toContain("FindSymbols");
  });

  it("should allow agent tools for modification requests", () => {
    const policy = resolve("Implemente retry no login");

    expect(policy.mode).toBe("auto");
    expect(policy.reason).toBe("modify");
    expect(policy.allowedTools).toEqual([]);
    expect(policy.evidenceRequired).toBe(true);
    expect(policy.allowPassiveEvidence).toBe(true);
  });

  it("should restrict explicit git update requests to git and terminal tools", () => {
    const policy = resolve(
      "faça analise dos ultimos commits, atualiza a branch develop",
    );

    expect(policy.mode).toBe("auto");
    expect(policy.reason).toBe("modify");
    expect(policy.allowedTools).toEqual([
      "RunCommand",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
    ]);
    expect(policy.evidenceRequired).toBe(true);
    expect(policy.allowPassiveEvidence).toBe(true);
  });

  it("should keep all agent tools available for create-read-open requests", () => {
    const policy = resolve(
      "crie um arquivo simples em .ts que leia um arquivo .txt da raiz do projeto depois abra ele no vscode",
    );

    expect(policy.mode).toBe("auto");
    expect(policy.reason).toBe("modify");
    expect(policy.allowedTools).toEqual([]);
  });

  it("should use inspection tools for validation requests", () => {
    const policy = resolve("valide esse projeto");

    expect(policy.mode).toBe("auto");
    expect(policy.reason).toBe("validate");
    expect(policy.allowedTools).toContain("Problems");
    expect(policy.allowedTools).toContain("GetDiagnostics");
  });

  it("should disable tools in ask mode", () => {
    const policy = resolve("leia tres arquivos do projeto", {
      mode: "ask",
    });

    expect(policy.mode).toBe("none");
    expect(policy.allowedTools).toEqual([]);
    expect(policy.allowPassiveEvidence).toBe(false);
  });
});
