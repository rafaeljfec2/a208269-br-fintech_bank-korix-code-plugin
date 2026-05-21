import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "../../types";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { ToolUsePolicyResolver } from "./ToolUsePolicyResolver";
import { WorkspaceEvidencePlanner } from "./WorkspaceEvidencePlanner";

describe("WorkspaceEvidencePlanner", () => {
  const context: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  };

  const plan = (message: string, overrides: Partial<ExecutionContext> = {}) => {
    const executionContext: ExecutionContext = {
      ...context,
      ...overrides,
      openFiles: overrides.openFiles ?? context.openFiles,
    };
    const profile = new TaskAnalyzer().analyze(message, executionContext);
    const policy = new ToolUsePolicyResolver().resolve(
      message,
      profile,
      executionContext,
    );

    return new WorkspaceEvidencePlanner().createPlan(
      message,
      profile,
      policy,
      executionContext,
    );
  };

  it("should create a read plan for explicit multi-file reads", () => {
    expect(plan("leia 3 arquivos do projeto")).toMatchObject({
      kind: "read",
      maxFiles: 3,
      maxChunksPerFile: 1,
      toolNames: ["ListDirectory", "SearchFiles", "ReadFile", "FileChunks"],
    });
  });

  it("should create a search plan with symbol hints", () => {
    expect(plan("busque AuthService no projeto")).toMatchObject({
      kind: "search",
      targetHints: ["AuthService"],
      maxFiles: 10,
    });
  });

  it("should include file path hints for direct file references", () => {
    expect(plan("leia src/core/runtime/runtimeState.ts")).toMatchObject({
      kind: "read",
      targetHints: ["src/core/runtime/runtimeState.ts"],
      maxFiles: 1,
    });
  });

  it("should not create a plan for general questions", () => {
    expect(
      plan("o que é async await?", {
        currentFile: undefined,
        openFiles: [],
      }),
    ).toBeUndefined();
  });

  it("should not create a plan in ask mode", () => {
    expect(
      plan("leia 3 arquivos do projeto", {
        mode: "ask",
      }),
    ).toBeUndefined();
  });
});
