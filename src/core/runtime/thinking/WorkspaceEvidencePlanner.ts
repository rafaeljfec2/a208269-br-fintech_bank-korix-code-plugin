import type { ExecutionContext } from "../../types";
import type {
  ThinkingRunProfile,
  ToolUsePolicy,
  WorkspaceEvidencePlan,
} from "./types";

const DEFAULT_MAX_READ_FILES = 1;
const DEFAULT_MAX_SEARCH_FILES = 10;
const NUMBER_WORDS = new Map<string, number>([
  ["um", 1],
  ["uma", 1],
  ["one", 1],
  ["dois", 2],
  ["duas", 2],
  ["two", 2],
  ["tres", 3],
  ["three", 3],
  ["quatro", 4],
  ["four", 4],
  ["cinco", 5],
  ["five", 5],
  ["seis", 6],
  ["six", 6],
  ["sete", 7],
  ["seven", 7],
  ["oito", 8],
  ["eight", 8],
  ["nove", 9],
  ["nine", 9],
  ["dez", 10],
  ["ten", 10],
]);

export class WorkspaceEvidencePlanner {
  createPlan(
    message: string,
    profile: ThinkingRunProfile,
    policy: ToolUsePolicy,
    context: ExecutionContext,
  ): WorkspaceEvidencePlan | undefined {
    if (context.mode === "ask" || policy.mode !== "required") {
      return undefined;
    }

    if (
      policy.reason !== "workspace_read" &&
      policy.reason !== "workspace_search" &&
      policy.reason !== "workspace_inspect"
    ) {
      return undefined;
    }

    const targetHints = this.extractTargetHints(message, profile);

    if (policy.reason === "workspace_search") {
      return {
        kind: "search",
        toolNames: policy.allowedTools,
        targetHints,
        maxFiles:
          this.extractRequestedFileCount(message) ?? DEFAULT_MAX_SEARCH_FILES,
        maxChunksPerFile: 1,
      };
    }

    if (policy.reason === "workspace_inspect") {
      return {
        kind: "inspect",
        toolNames: policy.allowedTools,
        targetHints,
        maxFiles:
          this.extractRequestedFileCount(message) ?? DEFAULT_MAX_READ_FILES,
        maxChunksPerFile: 1,
      };
    }

    return {
      kind: "read",
      toolNames: policy.allowedTools,
      targetHints,
      maxFiles:
        this.extractRequestedFileCount(message) ?? DEFAULT_MAX_READ_FILES,
      maxChunksPerFile: 1,
    };
  }

  private extractRequestedFileCount(message: string): number | undefined {
    const normalized = this.normalize(message);
    const numberWords = [...NUMBER_WORDS.keys()].join("|");
    const fileCountMatch = normalized.match(
      new RegExp(
        `\\b(\\d{1,2}|${numberWords})\\b\\s+(?:\\w+\\s+){0,2}(?:arquivo|arquivos|file|files)\\b`,
      ),
    );
    const fileCount = this.parseCountToken(fileCountMatch?.[1]);
    if (fileCount !== undefined) {
      return fileCount;
    }

    const digitMatch = normalized.match(/\b(\d{1,2})\b/);
    if (digitMatch?.[1]) {
      return this.parseCountToken(digitMatch[1]);
    }

    return undefined;
  }

  private parseCountToken(token: string | undefined): number | undefined {
    if (!token) {
      return undefined;
    }

    const numericValue = /^\d{1,2}$/.test(token)
      ? Number.parseInt(token, 10)
      : NUMBER_WORDS.get(token);

    return numericValue !== undefined
      ? Math.max(1, Math.min(25, numericValue))
      : undefined;
  }

  private extractTargetHints(
    message: string,
    profile: ThinkingRunProfile,
  ): readonly string[] {
    const hints = new Set<string>();
    const filePathMatches = message.matchAll(
      /\b[\w./-]+\.(?:ts|tsx|js|jsx|json|md|yml|yaml|css|scss|html)\b/g,
    );

    for (const match of filePathMatches) {
      hints.add(match[0]);
    }

    for (const symbol of profile.mentionedSymbols) {
      if (![...hints].some((hint) => hint.endsWith(symbol))) {
        hints.add(symbol);
      }
    }

    const normalized = this.normalize(message);
    const searchMatch = normalized.match(
      /\b(?:busque|buscar|procure|search|find)\s+([a-z0-9_$.-]+)/,
    );
    const rawSearchHint = searchMatch?.[1];
    if (rawSearchHint && !this.isStopWord(rawSearchHint)) {
      const originalHint = this.findOriginalToken(message, rawSearchHint);
      hints.add(originalHint ?? rawSearchHint);
    }

    return [...hints];
  }

  private findOriginalToken(
    message: string,
    normalizedToken: string,
  ): string | undefined {
    return message
      .split(/\s+/)
      .find((token) => this.normalize(token) === normalizedToken);
  }

  private isStopWord(value: string): boolean {
    return [
      "arquivo",
      "arquivos",
      "file",
      "files",
      "projeto",
      "project",
      "workspace",
    ].includes(value);
  }

  private normalize(message: string): string {
    return message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
}
