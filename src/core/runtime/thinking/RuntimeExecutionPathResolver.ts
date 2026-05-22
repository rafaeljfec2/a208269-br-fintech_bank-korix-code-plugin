import type { ExecutionContext } from "../../types";
import type {
  RuntimeExecutionPlan,
  ThinkingRunProfile,
  ToolUsePolicy,
} from "./types";

export interface RuntimeExecutionPathResolveInput {
  readonly message: string;
  readonly profile: ThinkingRunProfile;
  readonly context: ExecutionContext;
  readonly toolUsePolicy: ToolUsePolicy;
}

const SIMPLE_CHAT_MAX_TOKENS = 512;
const SIMPLE_CHAT_HISTORY_MESSAGES = 2;
const SIMPLE_CHAT_HISTORY_CHARS = 1000;
const DIRECT_ANSWER_MAX_TOKENS = 1536;
const DIRECT_ANSWER_HISTORY_MESSAGES = 6;
const DIRECT_ANSWER_HISTORY_CHARS = 6000;

export class RuntimeExecutionPathResolver {
  resolve(input: RuntimeExecutionPathResolveInput): RuntimeExecutionPlan {
    if (input.toolUsePolicy.mode !== "none") {
      return this.agentLoop(
        input.toolUsePolicy.reason.startsWith("workspace")
          ? "workspace_required"
          : "tool_required",
      );
    }

    if (input.profile.requiresWorkspaceEvidence) {
      return this.agentLoop("workspace_required");
    }

    if (input.profile.requiresToolUse) {
      return this.agentLoop("tool_required");
    }

    if (this.looksLikeInteractiveChoiceRequest(input.message)) {
      return this.agentLoop("tool_required");
    }

    if (this.looksLikeSimpleChat(input.message)) {
      return {
        path: "direct_llm",
        profile: "simple_chat",
        maxTokens: SIMPLE_CHAT_MAX_TOKENS,
        maxHistoryMessages: SIMPLE_CHAT_HISTORY_MESSAGES,
        maxHistoryChars: SIMPLE_CHAT_HISTORY_CHARS,
        reason: "simple_chat",
      };
    }

    if (
      input.profile.riskLevel === "low" &&
      (input.profile.intent === "answer" || input.profile.intent === "explain")
    ) {
      return {
        path: "direct_llm",
        profile: "direct_answer",
        maxTokens: DIRECT_ANSWER_MAX_TOKENS,
        maxHistoryMessages: DIRECT_ANSWER_HISTORY_MESSAGES,
        maxHistoryChars: DIRECT_ANSWER_HISTORY_CHARS,
        reason: "low_risk_answer",
      };
    }

    return this.agentLoop("tool_required");
  }

  private agentLoop(
    reason: RuntimeExecutionPlan["reason"],
  ): RuntimeExecutionPlan {
    return {
      path: "agent_loop",
      reason,
    };
  }

  private looksLikeSimpleChat(message: string): boolean {
    const normalized = this.normalize(message);

    return (
      /^(ola|oi|opa|e ai|bom dia|boa tarde|boa noite|hello|hi|hey)[!.?]*$/.test(
        normalized,
      ) ||
      /^(tudo bem|como vai|como voce esta|how are you)[?.!]*$/.test(
        normalized,
      ) ||
      /^(obrigado|obrigada|valeu|thanks|thank you)[!.?]*$/.test(normalized)
    );
  }

  private looksLikeInteractiveChoiceRequest(message: string): boolean {
    const normalized = this.normalize(message);

    return /\b(opcao|opcoes|option|options|alternativa|alternativas|choices|escolha|choose|pergunta|question)\b/.test(
      normalized,
    );
  }

  private normalize(message: string): string {
    return message
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ");
  }
}
