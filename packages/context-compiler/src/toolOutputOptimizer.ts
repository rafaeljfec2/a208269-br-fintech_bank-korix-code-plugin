import type {
  ContextReason,
  ToolOutputOptimizationRequest,
  ToolOutputOptimizationResult,
} from "./types";

const DEFAULT_TAIL_LINES = 20;

function isErrorLine(line: string): boolean {
  return /\b(error|failed|failure|exception|panic|fatal)\b/i.test(line);
}

function isStackTraceLine(line: string): boolean {
  return /^\s*(at\s+|\d+:\d+|File ".*", line \d+|Caused by:|stack backtrace:)/.test(
    line,
  );
}

function normalizeLines(output: string): readonly string[] {
  return output.replace(/\r\n/g, "\n").split("\n");
}

function appendUnique(lines: string[], seen: Set<string>, line: string): void {
  if (seen.has(line)) {
    return;
  }

  seen.add(line);
  lines.push(line);
}

function buildCandidateLines(lines: readonly string[]): readonly string[] {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (isErrorLine(line) || isStackTraceLine(line)) {
      appendUnique(selected, seen, line);
    }
  }

  for (const line of lines.slice(-DEFAULT_TAIL_LINES)) {
    appendUnique(selected, seen, line);
  }

  return selected;
}

function trimToMaxCharacters(lines: readonly string[], maxCharacters: number): string {
  const selected: string[] = [];
  let size = 0;

  for (const line of lines) {
    const nextSize = size + line.length + (selected.length > 0 ? 1 : 0);
    if (nextSize > maxCharacters) {
      break;
    }

    selected.push(line);
    size = nextSize;
  }

  return selected.join("\n");
}

export function optimizeToolOutput(
  request: ToolOutputOptimizationRequest,
): ToolOutputOptimizationResult {
  const originalCharacters = request.output.length;
  if (originalCharacters <= request.maxCharacters) {
    return {
      optimizedOutput: request.output,
      originalCharacters,
      optimizedCharacters: originalCharacters,
      omittedCharacters: 0,
      omittedLines: 0,
      reasons: [],
    };
  }

  const lines = normalizeLines(request.output);
  const candidateLines = buildCandidateLines(lines);
  const optimizedOutput = trimToMaxCharacters(
    candidateLines,
    Math.max(0, request.maxCharacters),
  );
  const optimizedLines = optimizedOutput.length > 0 ? normalizeLines(optimizedOutput) : [];
  const reasons: ContextReason[] = [
    { code: "terminal_output_compressed" },
    { code: "error_lines_prioritized" },
    { code: "tail_context_retained" },
  ];

  if ((request.diagnostics ?? []).length > 0) {
    reasons.push({ code: "diagnostics_available" });
  }

  return {
    optimizedOutput,
    originalCharacters,
    optimizedCharacters: optimizedOutput.length,
    omittedCharacters: originalCharacters - optimizedOutput.length,
    omittedLines: Math.max(0, lines.length - optimizedLines.length),
    reasons,
  };
}
