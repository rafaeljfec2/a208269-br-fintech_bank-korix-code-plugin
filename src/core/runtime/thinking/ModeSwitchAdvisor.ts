import type { AIProvider, ProviderEvent } from "../../providers/types";
import type { ExecutionContext, Mode } from "../../types";
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
  readonly provider: AIProvider;
  readonly maxTokens?: number;
}

export interface ParsedModeDecision {
  readonly needsModeSwitch: boolean;
  readonly recommendedMode: Mode;
  readonly question?: string;
}

export class ModeSwitchAdvisor {
  async resolve(
    input: ModeSwitchResolveInput,
  ): Promise<ModeSwitchRecommendation | undefined> {
    if (input.context.mode === "agent") {
      return undefined;
    }

    const rawDecision = await this.tryAskModel(input);
    const decision =
      this.parseModelDecision(rawDecision) ?? this.fallbackDecision(input);

    if (!decision?.needsModeSwitch) {
      return undefined;
    }

    return this.toRecommendation(input.context.mode, decision);
  }

  private async tryAskModel(input: ModeSwitchResolveInput): Promise<string> {
    try {
      return await this.askModel(input);
    } catch {
      return "";
    }
  }

  parseModelDecision(raw: string): ParsedModeDecision | undefined {
    const jsonText = this.extractJsonObject(raw);
    if (!jsonText) {
      return undefined;
    }

    let value: unknown;
    try {
      value = JSON.parse(jsonText);
    } catch {
      return undefined;
    }

    if (!this.isRecord(value)) {
      return undefined;
    }

    const needsModeSwitch = value.needsModeSwitch;
    const recommendedMode = value.recommendedMode;
    const question = value.question;

    if (typeof needsModeSwitch !== "boolean") {
      return undefined;
    }

    if (!this.isMode(recommendedMode)) {
      return undefined;
    }

    return {
      needsModeSwitch,
      recommendedMode,
      question: typeof question === "string" ? question : undefined,
    };
  }

  private async askModel(input: ModeSwitchResolveInput): Promise<string> {
    const correlationId = crypto.randomUUID();
    const stream = input.provider.send(
      {
        messages: [
          {
            role: "user",
            content: this.buildUserPrompt(input),
            timestamp: Date.now(),
          },
        ],
        system: this.buildSystemPrompt(),
        toolChoice: "none",
        temperature: 0,
        maxTokens: Math.min(input.maxTokens ?? 360, 360),
      },
      {
        correlationId,
        sessionId: crypto.randomUUID(),
        agentRunId: crypto.randomUUID(),
        iterationId: 0,
      },
    );

    let output = "";
    while (true) {
      const next = await stream.next();
      if (next.done) {
        break;
      }

      output += this.providerText(next.value);
    }

    return output;
  }

  private buildSystemPrompt(): string {
    return `You are Korix mode deliberation.

Decide whether the current request requires switching modes before the main assistant answers.
Think from the user's intent and available access, not from keyword rules.

Modes:
- ASK: normal chat only; no workspace reads, searches, tools, commands, or edits.
- PLAN: read-only workspace analysis and planning; no writes or execution side effects.
- AGENT: full agentic execution, including tools, commands, and file edits when appropriate.

Return ONLY compact JSON:
{"needsModeSwitch":boolean,"recommendedMode":"ask"|"plan"|"agent","question":"short user-facing question"}

Use PLAN for workspace understanding, project analysis, file inspection, debugging analysis, or implementation planning without edits.
Use AGENT for requests that ask Korix to change files, run commands, validate, fix, install, commit, or complete implementation work.
Use ASK only when the current mode is enough.`;
  }

  private buildUserPrompt(input: ModeSwitchResolveInput): string {
    const workspaceState =
      input.context.workspaceRoot.length > 0
        ? "workspace_open"
        : "no_workspace";
    const currentFile = input.context.currentFile ? "present" : "none";
    const selection = input.context.selection ? "present" : "none";
    const message = input.message.slice(0, 2000);

    return `Current mode: ${input.context.mode.toUpperCase()}
Workspace: ${workspaceState}
Current file: ${currentFile}
Selection: ${selection}
Open file count: ${input.context.openFiles.length}

Runtime signals, for context only:
- intent: ${input.profile.intent}
- risk: ${input.profile.riskLevel}
- requiresWorkspaceEvidence: ${input.profile.requiresWorkspaceEvidence}
- requiresToolUse: ${input.profile.requiresToolUse}
- plannedPath: ${input.executionPlan.path}
- plannedReason: ${input.executionPlan.reason}

User request:
${message}`;
  }

  private fallbackDecision(
    input: ModeSwitchResolveInput,
  ): ParsedModeDecision | undefined {
    if (
      input.context.mode === "ask" &&
      input.executionPlan.path === "agent_loop"
    ) {
      return {
        needsModeSwitch: true,
        recommendedMode:
          input.profile.intent === "modify" || input.profile.riskLevel !== "low"
            ? "agent"
            : "plan",
      };
    }

    if (
      input.context.mode === "plan" &&
      (input.profile.intent === "modify" || input.profile.riskLevel !== "low")
    ) {
      return {
        needsModeSwitch: true,
        recommendedMode: "agent",
      };
    }

    return undefined;
  }

  private toRecommendation(
    currentMode: Mode,
    decision: ParsedModeDecision,
  ): ModeSwitchRecommendation | undefined {
    const recommendedMode = this.normalizeRecommendedMode(
      currentMode,
      decision.recommendedMode,
    );

    if (recommendedMode === currentMode) {
      return undefined;
    }

    const options =
      currentMode === "ask"
        ? [
            this.optionFor(recommendedMode),
            this.optionFor(recommendedMode === "agent" ? "plan" : "agent"),
            this.optionFor("ask"),
          ]
        : [this.optionFor("agent"), this.optionFor("plan")];

    return {
      currentMode,
      recommendedMode,
      title: "Mudar modo",
      question:
        decision.question ??
        "Esse pedido precisa de outro modo para ser respondido corretamente. Deseja mudar?",
      options,
    };
  }

  private normalizeRecommendedMode(
    currentMode: Mode,
    recommendedMode: Mode,
  ): Mode {
    if (currentMode === "plan") {
      return recommendedMode === "agent" ? "agent" : "plan";
    }

    if (currentMode === "ask") {
      return recommendedMode === "agent" ? "agent" : "plan";
    }

    return currentMode;
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

  private providerText(event: ProviderEvent): string {
    switch (event.type) {
      case "token":
        return event.value;
      case "thinking":
      case "tool_call_delta":
      case "tool_call_complete":
      case "usage":
      case "finish":
      case "error":
        return "";
    }
  }

  private extractJsonObject(raw: string): string | undefined {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start < 0 || end <= start) {
      return undefined;
    }

    return raw.slice(start, end + 1);
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isMode(value: unknown): value is Mode {
    return value === "ask" || value === "plan" || value === "agent";
  }
}
