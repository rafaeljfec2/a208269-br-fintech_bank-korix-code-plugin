import type { Mode, ExecutionContext } from "../../types";
import type { RuntimeExecutionPlan, ThinkingRunProfile } from "./types";

export interface ModeSwitchOption {
  readonly mode: Mode;
  readonly label: string;
  readonly description: string;
}

export interface ModeSwitchRecommendation {
  readonly currentMode: Mode;
  readonly recommendedMode: Mode;
  readonly title: string;
  readonly question: string;
  readonly options: readonly ModeSwitchOption[];
}

export interface ModeSwitchResolveInput {
  readonly message: string;
  readonly profile: ThinkingRunProfile;
  readonly context: ExecutionContext;
  readonly executionPlan: RuntimeExecutionPlan;
}

export class ModeSwitchAdvisor {
  resolve(
    input: ModeSwitchResolveInput,
  ): ModeSwitchRecommendation | undefined {
    if (input.context.mode === "agent") {
      return undefined;
    }

    if (
      input.context.mode === "ask" &&
      input.executionPlan.path === "agent_loop"
    ) {
      return this.askModeRecommendation(input);
    }

    if (
      input.context.mode === "plan" &&
      (input.profile.intent === "modify" || input.profile.riskLevel !== "low")
    ) {
      return this.planModeRecommendation();
    }

    return undefined;
  }

  private askModeRecommendation(
    input: ModeSwitchResolveInput,
  ): ModeSwitchRecommendation {
    const recommendedMode = this.shouldExecute(input) ? "agent" : "plan";
    const secondaryMode = recommendedMode === "agent" ? "plan" : "agent";

    return {
      currentMode: "ask",
      recommendedMode,
      title: "Mudar modo",
      question:
        "Esse pedido precisa acessar o workspace ou usar ferramentas. Para qual modo deseja mudar?",
      options: [
        this.optionFor(recommendedMode),
        this.optionFor(secondaryMode),
        this.optionFor("ask"),
      ],
    };
  }

  private planModeRecommendation(): ModeSwitchRecommendation {
    return {
      currentMode: "plan",
      recommendedMode: "agent",
      title: "Mudar modo",
      question:
        "Esse pedido parece exigir execução ou alteração de arquivos. Deseja mudar para AGENT?",
      options: [this.optionFor("agent"), this.optionFor("plan")],
    };
  }

  private shouldExecute(input: ModeSwitchResolveInput): boolean {
    return input.profile.intent === "modify" || input.profile.riskLevel !== "low";
  }

  private optionFor(mode: Mode): ModeSwitchOption {
    switch (mode) {
      case "agent":
        return {
          mode,
          label: "AGENT",
          description:
            "Permite executar ferramentas, editar arquivos e conduzir a tarefa até implementação.",
        };
      case "plan":
        return {
          mode,
          label: "PLAN",
          description:
            "Permite analisar o workspace em modo read-only e preparar um plano sem alterar arquivos.",
        };
      case "ask":
        return {
          mode,
          label: "ASK",
          description:
            "Mantém chat normal sem acesso ao workspace; Korix não tentará ler arquivos nem executar tools.",
        };
    }
  }
}
