/**
 * Problems Tool - aggregate all workspace diagnostics
 *
 * Performance target: < 100ms
 *
 * Uses VSCode diagnostics API:
 * - vscode.languages.getDiagnostics()
 * - Aggregates errors and warnings
 * - Filters by severity
 */

import * as vscode from "vscode";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const ProblemsSchema = z.object({
  severity: z
    .enum(["error", "warning", "info", "hint", "all"])
    .optional()
    .describe("Filter by severity (default: all)"),
  maxResults: z.number().optional().describe("Maximum results (default: 100)"),
  filesOnly: z
    .array(z.string())
    .optional()
    .describe("Only include these files"),
});

type ProblemsInput = z.infer<typeof ProblemsSchema>;

interface Problem {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly severity: "error" | "warning" | "info" | "hint";
  readonly message: string;
  readonly source?: string; // Language server name
  readonly code?: string | number;
}

/**
 * Get all problems in workspace
 *
 * Algorithm:
 * 1. Call vscode.languages.getDiagnostics()
 * 2. Filter by severity if specified
 * 3. Filter by files if specified
 * 4. Limit to maxResults
 * 5. Return structured problems
 */
export const ProblemsTool: Tool<ProblemsInput, Problem[]> = {
  name: "Problems",
  description: "Get all diagnostics (errors, warnings, info) from workspace",
  schema: ProblemsSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  execute(input: ProblemsInput, _context: ToolContext): ToolResult<Problem[]> {
    const startTime = Date.now();

    try {
      const problems = getProblems(input);

      return {
        success: true,
        data: problems,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

/**
 * Get problems from VSCode diagnostics
 */
function getProblems(input: ProblemsInput): Problem[] {
  // Get all diagnostics
  const diagnostics = vscode.languages.getDiagnostics();

  const problems: Problem[] = [];
  const maxResults = input.maxResults ?? 100;

  // Filter severity
  const targetSeverity = input.severity ?? "all";

  for (const [uri, uriDiagnostics] of diagnostics) {
    // Filter by files if specified
    if (input.filesOnly && input.filesOnly.length > 0) {
      const filePath = uri.fsPath;
      const matches = input.filesOnly.some((f) => filePath.includes(f));
      if (!matches) {
        continue;
      }
    }

    for (const diagnostic of uriDiagnostics) {
      // Filter by severity
      if (targetSeverity !== "all") {
        const severity = severityToString(diagnostic.severity);
        if (severity !== targetSeverity) {
          continue;
        }
      }

      problems.push({
        file: uri.fsPath,
        line: diagnostic.range.start.line,
        column: diagnostic.range.start.character,
        endLine: diagnostic.range.end.line,
        endColumn: diagnostic.range.end.character,
        severity: severityToString(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        code:
          typeof diagnostic.code === "object"
            ? diagnostic.code.value
            : diagnostic.code,
      });

      // Stop if max results reached
      if (problems.length >= maxResults) {
        return problems;
      }
    }
  }

  return problems;
}

/**
 * Convert VSCode DiagnosticSeverity to string
 */
function severityToString(
  severity: vscode.DiagnosticSeverity,
): "error" | "warning" | "info" | "hint" {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "info";
  }
}
