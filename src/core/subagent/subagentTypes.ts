import type { ExecutionContext } from "../types";

export type SubagentType = "explore" | "plan" | "review" | "shell" | "test";

export interface SubagentConfig {
  readonly type: SubagentType;
  readonly allowedTools: readonly string[];
  readonly maxIterations: number;
  readonly timeout: number;
  readonly resourceLimits: SubagentResourceLimits;
  readonly isolated: boolean;
}

export interface SubagentResourceLimits {
  readonly maxToolCalls: number;
  readonly maxOutputBytes: number;
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
    readonly toolCallCount?: number;
    readonly outputBytes?: number;
    readonly stopReason?:
      | "completed"
      | "runtime_error"
      | "timeout"
      | "tool_calls"
      | "output_bytes";
    readonly limitExceeded?: "tool_calls" | "output_bytes";
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
    resourceLimits: {
      maxToolCalls: 25,
      maxOutputBytes: 64_000,
    },
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
    resourceLimits: {
      maxToolCalls: 30,
      maxOutputBytes: 96_000,
    },
    isolated: true,
  },
  review: {
    type: "review",
    allowedTools: [
      "ReadFile",
      "ListDirectory",
      "Grep",
      "FindReferences",
      "FindSymbols",
      "GitStatus",
      "GitDiff",
      "ChangedFiles",
      "Problems",
      "GetDiagnostics",
      "WorkspaceGraph",
      "Glob",
    ],
    maxIterations: 12,
    timeout: 120_000,
    resourceLimits: {
      maxToolCalls: 30,
      maxOutputBytes: 96_000,
    },
    isolated: true,
  },
  shell: {
    type: "shell",
    allowedTools: ["RunCommand", "Await"],
    maxIterations: 5,
    timeout: 300_000,
    resourceLimits: {
      maxToolCalls: 8,
      maxOutputBytes: 32_000,
    },
    isolated: true,
  },
  test: {
    type: "test",
    allowedTools: ["RunCommand", "Await", "ReadFile"],
    maxIterations: 8,
    timeout: 600_000,
    resourceLimits: {
      maxToolCalls: 12,
      maxOutputBytes: 64_000,
    },
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

  if (type === "review") {
    return [
      "You are a code review subagent for Korix Code.",
      "Search and read the codebase using only read-only tools.",
      "Review changed code for correctness, security, quality, maintainability, project conventions, and regression risk.",
      "Return structured findings with severity, file/path/line evidence when available, issue, impact, recommendation, and test gaps.",
      "Prioritize real bugs and risks over style preferences, and state when no issues are found.",
      "Do not modify files, run commands, delete files, update todos, launch subagents, fetch the web, or ask the user questions.",
    ].join("\n");
  }

  if (type === "shell") {
    return [
      "You are a shell execution subagent for Korix Code.",
      "Use only RunCommand and Await through the runtime approval flow.",
      "Run only necessary commands, prefer explicit timeouts, and use background execution plus Await for long-running commands.",
      "Report the command, stdout, stderr, exit code, timeout status, and any failures.",
      "Avoid destructive commands unless explicitly requested and approved by the runtime.",
      "Do not modify files directly, delete files, update todos, launch subagents, fetch the web, or ask the user questions.",
    ].join("\n");
  }

  if (type === "test") {
    return [
      "You are a test execution subagent for Korix Code.",
      "Use only RunCommand, Await, and ReadFile through the runtime approval flow.",
      "Run focused tests relevant to the request, prefer explicit timeouts, and use background execution plus Await for long-running suites.",
      "Report the command, pass/fail status, stdout, stderr, exit code, failure details, and verification gaps.",
      "Inspect test files or failure artifacts with ReadFile only when it helps explain failures.",
      "Do not modify files, delete files, update todos, launch subagents, fetch the web, or ask the user questions.",
    ].join("\n");
  }

  return "You are a Korix subagent.";
}
