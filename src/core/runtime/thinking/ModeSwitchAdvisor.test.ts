import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "../../types";
import { ModeSwitchAdvisor } from "./ModeSwitchAdvisor";
import { RuntimeExecutionPathResolver } from "./RuntimeExecutionPathResolver";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { ToolUsePolicyResolver } from "./ToolUsePolicyResolver";

describe("ModeSwitchAdvisor", () => {
  const resolve = (message: string, mode: ExecutionContext["mode"]) => {
    const context: ExecutionContext = {
      mode,
      workspaceRoot: "/repo",
      currentFile: "/repo/src/index.ts",
      openFiles: ["/repo/src/index.ts"],
    };
    const profile = new TaskAnalyzer().analyze(message, context);
    const toolUsePolicy = new ToolUsePolicyResolver().resolve(
      message,
      profile,
      context,
    );
    const executionPlan = new RuntimeExecutionPathResolver().resolve({
      message,
      profile,
      context,
      toolUsePolicy,
    });

    return new ModeSwitchAdvisor().resolve({
      message,
      profile,
      context,
      executionPlan,
    });
  };

  it("should recommend PLAN for ask-mode workspace analysis", () => {
    const recommendation = resolve("analise esse projeto", "ask");

    expect(recommendation?.recommendedMode).toBe("plan");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "plan",
      "agent",
      "ask",
    ]);
  });

  it("should recommend AGENT for ask-mode implementation requests", () => {
    const recommendation = resolve("implemente retry no login", "ask");

    expect(recommendation?.recommendedMode).toBe("agent");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "agent",
      "plan",
      "ask",
    ]);
  });

  it("should recommend AGENT for plan-mode implementation requests", () => {
    const recommendation = resolve("corrija o bug de autenticação", "plan");

    expect(recommendation?.recommendedMode).toBe("agent");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "agent",
      "plan",
    ]);
  });

  it("should not recommend a switch for direct ask-mode answers", () => {
    const recommendation = resolve("o que é async await?", "ask");

    expect(recommendation).toBeUndefined();
  });
});
