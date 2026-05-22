import type { ExecutionContext } from "../types";

export type SubagentType = "explore";

export interface SubagentConfig {
  readonly type: SubagentType;
  readonly allowedTools: readonly string[];
  readonly maxIterations: number;
  readonly timeout: number;
  readonly isolated: boolean;
}

export interface SubagentRequest {
  readonly type: SubagentType;
  readonly prompt: string;
  readonly context?: Record<string, unknown>;
  readonly executionContext: ExecutionContext;
}

export interface SubagentResult {
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly duration: number;
  readonly error?: string;
  readonly metadata: {
    readonly toolsCalled: readonly string[];
  };
}

export const SUBAGENT_CONFIGS: Record<SubagentType, SubagentConfig> = {
  explore: {
    type: "explore",
    allowedTools: [
      "ReadFile",
      "ListDirectory",
      "SearchFiles",
      "Grep",
      "FindReferences",
      "FindSymbols",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "WorkspaceGraph",
      "GetOpenFiles",
      "GetCurrentFile",
    ],
    maxIterations: 10,
    timeout: 60_000,
    isolated: true,
  },
};

export function buildSubagentPrompt(type: SubagentType): string {
  if (type === "explore") {
    return [
      "You are an exploration subagent.",
      "Search and read the codebase using only read-only tools.",
      "Return concise findings with file paths, symbols, and relevant evidence.",
      "Do not modify files, run commands, delete files, or ask the user questions.",
    ].join("\n");
  }

  return "You are a Korix subagent.";
}
