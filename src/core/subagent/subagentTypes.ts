import type { ExecutionContext } from "../types";

export type SubagentType = "explore" | "plan";

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
  plan: {
    type: "plan",
    allowedTools: [
      "ReadFile",
      "ListDirectory",
      "Grep",
      "FindReferences",
      "FindSymbols",
      "WorkspaceGraph",
      "GetOpenFiles",
      "GetCurrentFile",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "Glob",
    ],
    maxIterations: 12,
    timeout: 120_000,
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

  if (type === "plan") {
    return [
      "You are a planning subagent for Korix Code.",
      "Search and read the codebase using only read-only tools.",
      "Produce a concise implementation plan in Markdown with SDD and TDD traceability.",
      "Include: relevant files, acceptance criteria, Red tests, Green implementation steps, verification commands, risks, and open questions.",
      "Ground claims in file paths, symbols, diffs, diagnostics, or workspace graph evidence when available.",
      "Do not modify files, run commands, delete files, update todos, launch subagents, fetch the web, or ask the user questions.",
    ].join("\n");
  }

  return "You are a Korix subagent.";
}
