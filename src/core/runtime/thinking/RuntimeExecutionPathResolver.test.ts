import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "../../types";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { ToolUsePolicyResolver } from "./ToolUsePolicyResolver";
import { RuntimeExecutionPathResolver } from "./RuntimeExecutionPathResolver";

describe("RuntimeExecutionPathResolver", () => {
  const baseContext: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/repo",
    currentFile: "/repo/src/index.ts",
    openFiles: ["/repo/src/index.ts"],
  };

  const resolve = (
    message: string,
    overrides: Partial<ExecutionContext> = {},
  ) => {
    const context: ExecutionContext = {
      ...baseContext,
      ...overrides,
      openFiles: overrides.openFiles ?? baseContext.openFiles,
    };
    const profile = new TaskAnalyzer().analyze(message, context);
    const toolUsePolicy = new ToolUsePolicyResolver().resolve(
      message,
      profile,
      context,
    );

    return new RuntimeExecutionPathResolver().resolve({
      message,
      profile,
      context,
      toolUsePolicy,
    });
  };

  it("should route short greetings to the direct LLM path in agent mode", () => {
    const plan = resolve("ola");

    expect(plan).toEqual({
      path: "direct_llm",
      profile: "simple_chat",
      maxTokens: 512,
      maxHistoryMessages: 2,
      maxHistoryChars: 1000,
      reason: "simple_chat",
    });
  });

  it("should route general low-risk answers to the direct LLM path", () => {
    const plan = resolve("O que é async/await?", {
      mode: "ask",
      currentFile: undefined,
      openFiles: [],
    });

    expect(plan.path).toBe("direct_llm");
    expect(plan.profile).toBe("direct_answer");
    expect(plan.reason).toBe("low_risk_answer");
    expect(plan.maxHistoryMessages).toBe(6);
  });

  it("should keep explicit workspace reads on the agent loop", () => {
    const plan = resolve("leia tres arquivos do projeto");

    expect(plan).toEqual({
      path: "agent_loop",
      reason: "workspace_required",
    });
  });

  it("should keep modification requests on the agent loop", () => {
    const plan = resolve("Implemente retry no login");

    expect(plan.path).toBe("agent_loop");
    expect(plan.reason).toBe("tool_required");
  });

  it("should route git branch update requests to the agent loop", () => {
    const plan = resolve(
      "faça analise dos ultimos commits, atualiza a branch develop",
    );

    expect(plan).toEqual({
      path: "agent_loop",
      reason: "tool_required",
    });
  });
});
