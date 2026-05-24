import type { ContextFile, ContextIR, ContextReason } from "./types";

function formatReasons(reasons: readonly ContextReason[]): string {
  if (reasons.length === 0) {
    return "unspecified";
  }

  return reasons
    .map((reason) =>
      reason.detail === undefined
        ? reason.code
        : `${reason.code}: ${reason.detail}`,
    )
    .join(", ");
}

function formatFile(
  file: ContextFile,
  filesWithSymbolChunks: ReadonlySet<string>,
): string {
  const lines = [
    `## File: ${file.path}`,
    `- Mode: ${file.includedMode}`,
    `- Estimated tokens: ${file.estimatedTokens}`,
    `- Reasons: ${formatReasons(file.reasons)}`,
  ];

  if (filesWithSymbolChunks.has(file.path)) {
    lines.push(
      "- Source: semantic symbols above; full file content omitted from provider context",
    );
  } else if (file.content !== undefined && file.includedMode !== "metadata") {
    lines.push("", "```", file.content, "```");
  }

  return lines.join("\n");
}

export function formatContextIrForProvider(contextIr: ContextIR): string {
  const filesWithSymbolChunks = new Set(
    contextIr.context.symbols.map((symbol) => symbol.file),
  );
  const parts: string[] = [
    "# Workspace Context",
    "",
    "## Task",
    contextIr.task.userPrompt,
    "",
    "## Context Statistics",
    `- Files included: ${contextIr.context.files.length}`,
    `- Symbols included: ${contextIr.context.symbols.length}`,
    `- Diagnostics included: ${contextIr.context.diagnostics.length}`,
    `- Estimated tokens: ${contextIr.budget.estimatedTokens}`,
    `- Tokens before optimization: ${contextIr.budget.tokensBeforeOptimization}`,
    `- Token savings: ${contextIr.metrics.tokenSavingsPercent.toFixed(1)}%`,
  ];

  if (contextIr.context.symbols.length > 0) {
    parts.push("", "## Relevant Symbols");
    for (const symbol of contextIr.context.symbols) {
      parts.push(
        "",
        `### ${symbol.kind}: ${symbol.name}`,
        `- File: ${symbol.file}`,
        `- Lines: ${symbol.range.startLine}-${symbol.range.endLine}`,
        `- Reasons: ${formatReasons(symbol.reasons)}`,
        "",
        "```",
        symbol.content,
        "```",
      );
    }
  }

  if (contextIr.context.files.length > 0) {
    parts.push("", "## Relevant Files");
    for (const file of contextIr.context.files) {
      parts.push("", formatFile(file, filesWithSymbolChunks));
    }
  }

  if (contextIr.context.summaries.length > 0) {
    parts.push("", "## Summary Context");
    for (const summary of contextIr.context.summaries) {
      parts.push(
        "",
        `### ${summary.path}`,
        `- Source hash: ${summary.sourceHash}`,
        `- Estimated tokens: ${summary.estimatedTokens}`,
        `- Reasons: ${formatReasons(summary.reasons)}`,
        "",
        summary.summary,
      );
    }
  }

  if (contextIr.context.diagnostics.length > 0) {
    parts.push("", "## Diagnostics");
    for (const diagnostic of contextIr.context.diagnostics) {
      parts.push(
        `- ${diagnostic.path}: ${diagnostic.message}${
          diagnostic.severity === undefined ? "" : ` (${diagnostic.severity})`
        }`,
      );
    }
  }

  if (contextIr.omitted.length > 0) {
    parts.push(
      "",
      "## Omitted Context Summary",
      `- Omitted items: ${contextIr.omitted.length}`,
    );
  }

  return parts.join("\n");
}
