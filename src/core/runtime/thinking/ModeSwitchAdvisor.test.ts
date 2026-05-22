import { describe, expect, it } from "vitest";
import type {
  AIProvider,
  ProviderEvent,
  ProviderInput,
  ProviderMetadata,
  RequestContext,
} from "../../providers/types";
import type { ExecutionContext } from "../../types";
import { ModeSwitchAdvisor } from "./ModeSwitchAdvisor";
import type { RuntimeExecutionPlan, ThinkingRunProfile } from "./types";

describe("ModeSwitchAdvisor", () => {
  it("should parse compact model JSON decisions", () => {
    const decision = new ModeSwitchAdvisor().parseModelDecision(
      '{"needsModeSwitch":true,"recommendedMode":"plan","question":"Mudar para PLAN?"}',
    );

    expect(decision).toEqual({
      needsModeSwitch: true,
      recommendedMode: "plan",
      question: "Mudar para PLAN?",
    });
  });

  it("should ask the model before recommending PLAN for ask-mode workspace analysis", async () => {
    const provider = createProvider(
      '{"needsModeSwitch":true,"recommendedMode":"plan","question":"Para analisar este projeto, deseja mudar para PLAN?"}',
    );

    const recommendation = await resolve(provider, "Me fale sobre esse projeto");

    expect(recommendation?.recommendedMode).toBe("plan");
    expect(recommendation?.question).toContain("deseja mudar para PLAN");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "plan",
      "agent",
      "ask",
    ]);
    expect(provider.capturedInput?.toolChoice).toBe("none");
    expect(provider.capturedInput?.maxTokens).toBe(360);
  });

  it("should ask the model before recommending AGENT for implementation requests", async () => {
    const provider = createProvider(
      '{"needsModeSwitch":true,"recommendedMode":"agent","question":"Para implementar isso, deseja mudar para AGENT?"}',
    );

    const recommendation = await resolve(provider, "implemente retry no login");

    expect(recommendation?.recommendedMode).toBe("agent");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "agent",
      "plan",
      "ask",
    ]);
    expect(provider.capturedInput?.system).toContain("Think from the user");
  });

  it("should ask the model before recommending AGENT from plan mode", async () => {
    const provider = createProvider(
      '{"needsModeSwitch":true,"recommendedMode":"agent","question":"Para editar arquivos, deseja mudar para AGENT?"}',
    );

    const recommendation = await resolve(
      provider,
      "corrija o bug de autenticação",
      "plan",
    );

    expect(recommendation?.recommendedMode).toBe("agent");
    expect(recommendation?.options.map((option) => option.mode)).toEqual([
      "agent",
      "plan",
    ]);
  });

  it("should continue without prompt when the model says the current mode is enough", async () => {
    const provider = createProvider(
      '{"needsModeSwitch":false,"recommendedMode":"ask","question":""}',
    );

    const recommendation = await resolve(provider, "o que é async await?");

    expect(recommendation).toBeUndefined();
  });

  it("should use deterministic signals only as fallback when model JSON is invalid", async () => {
    const provider = createProvider("not json");

    const recommendation = await resolve(provider, "analise esse projeto");

    expect(recommendation?.recommendedMode).toBe("plan");
  });
});

interface CapturingProvider extends AIProvider {
  capturedInput?: ProviderInput;
}

function createProvider(response: string): CapturingProvider {
  const provider: CapturingProvider = {
    type: "test",
    config: {
      type: "test",
      apiKey: "test",
      model: "test",
    },
    async *send(
      input: ProviderInput,
      _context: RequestContext,
    ): AsyncGenerator<ProviderEvent, ProviderMetadata, void> {
      provider.capturedInput = input;
      yield {
        type: "token",
        value: response,
        timestamp: Date.now(),
        correlation: {
          correlationId: "test",
          sessionId: "test",
        },
      };

      return {
        model: "test",
        totalDuration: 1,
      };
    },
    async dispose(): Promise<void> {
      return undefined;
    },
  };

  return provider;
}

async function resolve(
  provider: CapturingProvider,
  message: string,
  mode: ExecutionContext["mode"] = "ask",
) {
  const context: ExecutionContext = {
    mode,
    workspaceRoot: "/repo",
    currentFile: "/repo/src/index.ts",
    openFiles: ["/repo/src/index.ts"],
  };
  const profile: ThinkingRunProfile = {
    intent: message.includes("implemente") ? "modify" : "explain",
    riskLevel: message.includes("implemente") ? "medium" : "low",
    requiresWorkspaceEvidence: true,
    requiresToolUse: false,
    workspaceAccess: {
      requested: true,
      action: "inspect",
      explicit: false,
    },
    mentionedSymbols: [],
    constraints: [],
    summary: "test",
  };
  const executionPlan: RuntimeExecutionPlan = {
    path: "agent_loop",
    reason: "workspace_required",
  };

  return new ModeSwitchAdvisor().resolve({
    message,
    profile,
    context,
    executionPlan,
    provider,
  });
}
