import type { Mode } from "../../types";

export interface ChatHistoryMessage {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

export type InteractionContextOmissionReason =
  | "stale_mode_claim"
  | "history_budget"
  | "retry_placeholder";

export interface OmittedInteractionMessage {
  readonly index: number;
  readonly role: ChatHistoryMessage["role"];
  readonly reason: InteractionContextOmissionReason;
}

export interface InteractionContextCompileInput {
  readonly message: string;
  readonly previousMessages: readonly ChatHistoryMessage[];
  readonly mode: Mode;
  readonly maxPreviousMessages?: number;
  readonly maxPreviousChars?: number;
}

export interface CompiledInteractionContext {
  readonly currentMessage: string;
  readonly effectiveMessage: string;
  readonly previousMessages: readonly ChatHistoryMessage[];
  readonly omittedMessages: readonly OmittedInteractionMessage[];
  readonly continuationOf?: string;
  readonly mode: Mode;
}

interface IndexedHistoryMessage {
  readonly index: number;
  readonly message: ChatHistoryMessage;
}

export class InteractionContextCompiler {
  compile(input: InteractionContextCompileInput): CompiledInteractionContext {
    if (input.mode === "ask") {
      return {
        currentMessage: input.message,
        effectiveMessage: input.message,
        previousMessages: input.previousMessages,
        omittedMessages: [],
        mode: input.mode,
      };
    }

    const sanitized = this.removeStaleModeClaims(input.previousMessages);
    const continuationOf = this.resolveContinuation(
      input.message,
      input.previousMessages,
      sanitized.removedStaleModeClaim,
    );
    const withoutRetryPlaceholders = sanitized.removedStaleModeClaim
      ? this.removeRetryPlaceholders(sanitized.messages)
      : {
          messages: sanitized.messages,
          omittedMessages: [],
        };
    const budgeted = this.applyHistoryBudget(
      withoutRetryPlaceholders.messages,
      input,
    );
    const omittedMessages = [
      ...sanitized.omittedMessages,
      ...withoutRetryPlaceholders.omittedMessages,
      ...budgeted.omittedMessages,
    ].sort((left, right) => left.index - right.index);

    return {
      currentMessage: input.message,
      effectiveMessage:
        continuationOf !== undefined
          ? this.buildContinuationMessage(continuationOf, input.message)
          : input.message,
      previousMessages: budgeted.messages.map((entry) => entry.message),
      omittedMessages,
      continuationOf,
      mode: input.mode,
    };
  }

  private removeRetryPlaceholders(messages: readonly IndexedHistoryMessage[]): {
    readonly messages: readonly IndexedHistoryMessage[];
    readonly omittedMessages: readonly OmittedInteractionMessage[];
  } {
    const retainedMessages: IndexedHistoryMessage[] = [];
    const omittedMessages: OmittedInteractionMessage[] = [];

    messages.forEach((entry) => {
      if (
        entry.message.role === "user" &&
        this.isRetryAfterModeSwitchRequest(entry.message.content)
      ) {
        omittedMessages.push({
          index: entry.index,
          role: entry.message.role,
          reason: "retry_placeholder",
        });
        return;
      }

      retainedMessages.push(entry);
    });

    return {
      messages: retainedMessages,
      omittedMessages,
    };
  }

  private removeStaleModeClaims(
    previousMessages: readonly ChatHistoryMessage[],
  ): {
    readonly messages: readonly IndexedHistoryMessage[];
    readonly omittedMessages: readonly OmittedInteractionMessage[];
    readonly removedStaleModeClaim: boolean;
  } {
    const messages: IndexedHistoryMessage[] = [];
    const omittedMessages: OmittedInteractionMessage[] = [];

    previousMessages.forEach((message, index) => {
      if (
        message.role === "assistant" &&
        this.isStaleAskModeClaim(message.content)
      ) {
        omittedMessages.push({
          index,
          role: message.role,
          reason: "stale_mode_claim",
        });
        return;
      }

      messages.push({ index, message });
    });

    return {
      messages,
      omittedMessages,
      removedStaleModeClaim: omittedMessages.length > 0,
    };
  }

  private resolveContinuation(
    message: string,
    previousMessages: readonly ChatHistoryMessage[],
    removedStaleModeClaim: boolean,
  ): string | undefined {
    if (
      !removedStaleModeClaim ||
      !this.isRetryAfterModeSwitchRequest(message)
    ) {
      return undefined;
    }

    return this.findLastActionableUserMessage(previousMessages);
  }

  private applyHistoryBudget(
    messages: readonly IndexedHistoryMessage[],
    input: InteractionContextCompileInput,
  ): {
    readonly messages: readonly IndexedHistoryMessage[];
    readonly omittedMessages: readonly OmittedInteractionMessage[];
  } {
    if (
      input.maxPreviousMessages === undefined &&
      input.maxPreviousChars === undefined
    ) {
      return {
        messages,
        omittedMessages: [],
      };
    }

    const maxPreviousMessages =
      input.maxPreviousMessages !== undefined
        ? Math.max(0, input.maxPreviousMessages)
        : Number.POSITIVE_INFINITY;
    const maxPreviousChars =
      input.maxPreviousChars !== undefined
        ? Math.max(0, input.maxPreviousChars)
        : Number.POSITIVE_INFINITY;
    const selected: IndexedHistoryMessage[] = [];
    const omittedMessages: OmittedInteractionMessage[] = [];
    let usedChars = 0;

    for (let index = messages.length - 1; index >= 0; index--) {
      const entry = messages[index];
      if (entry === undefined) {
        continue;
      }

      const nextChars = usedChars + entry.message.content.length;
      if (
        selected.length < maxPreviousMessages &&
        nextChars <= maxPreviousChars
      ) {
        selected.push(entry);
        usedChars = nextChars;
        continue;
      }

      omittedMessages.push({
        index: entry.index,
        role: entry.message.role,
        reason: "history_budget",
      });
    }

    return {
      messages: selected.reverse(),
      omittedMessages,
    };
  }

  private buildContinuationMessage(
    previousRequest: string,
    currentMessage: string,
  ): string {
    return [
      "Pedido anterior retomado apos troca de modo:",
      previousRequest,
      "",
      "Mensagem atual do usuario:",
      currentMessage,
    ].join("\n");
  }

  private findLastActionableUserMessage(
    previousMessages: readonly ChatHistoryMessage[],
  ): string | undefined {
    for (let index = previousMessages.length - 1; index >= 0; index--) {
      const message = previousMessages[index];
      if (
        message?.role === "user" &&
        message.content.trim().length > 0 &&
        !this.isRetryAfterModeSwitchRequest(message.content)
      ) {
        return message.content;
      }
    }

    return undefined;
  }

  private isStaleAskModeClaim(content: string): boolean {
    const normalized = this.normalizeForModeSensitiveMatch(content);

    return (
      /\bmodo\s+ask\b/.test(normalized) ||
      /\bask\s+mode\b/.test(normalized) ||
      /\bmode:\s*ask\b/.test(normalized) ||
      /\bmodo\s+atual\b/.test(normalized) ||
      /modo\s+de\s+resposta\s+direta/.test(normalized) ||
      /sem\s+acesso\s+a(?:os?|s)?\s+ferramentas/.test(normalized) ||
      /sem\s+acesso\s+a(?:os?|s)?\s+arquivos/.test(normalized) ||
      /sem\s+acesso\s+ao\s+workspace/.test(normalized) ||
      /nao\s+tenho\s+acesso\s+ao\s+workspace/.test(normalized) ||
      /nao\s+consigo\s+(listar|ler|abrir|buscar|acessar)/.test(normalized) ||
      /continuo\s+sem\s+acesso/.test(normalized) ||
      /cole?\s+o\s+conteudo/.test(normalized) ||
      /colar\s+o\s+conteudo/.test(normalized) ||
      /troque\s+para\s+(o\s+)?modo\s+agent/.test(normalized)
    );
  }

  private isRetryAfterModeSwitchRequest(content: string): boolean {
    const normalized = this.normalizeForModeSensitiveMatch(content);

    return (
      /\b(tente|tentar|try)\b.*\b(novamente|again|agora|now)\b/.test(
        normalized,
      ) ||
      /\b(retry|tente\s+novamente|tentar\s+novamente|try\s+again)\b/.test(
        normalized,
      )
    );
  }

  private normalizeForModeSensitiveMatch(content: string): string {
    return content
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
}
