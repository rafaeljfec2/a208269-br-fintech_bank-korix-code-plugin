/**
 * Grep Tool - ripgrep-based code search with streaming
 *
 * Performance target: < 200ms for 100 matches
 *
 * Uses ripgrep --json for:
 * - 10-100x faster than Node regex
 * - Finite automata regex engine
 * - SIMD optimized
 * - Streaming results
 * - Context lines support
 */

import { spawn } from "child_process";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const GrepSchema = z.object({
  pattern: z.string().describe("Regex pattern to search"),
  paths: z
    .array(z.string())
    .optional()
    .describe("Specific paths to search (default: workspace root)"),
  ignoreCase: z
    .boolean()
    .optional()
    .describe("Case insensitive search (default: true)"),
  contextLines: z
    .number()
    .optional()
    .describe("Number of context lines before/after match"),
  maxResults: z.number().optional().describe("Maximum results (default: 100)"),
  fileTypes: z
    .array(z.string())
    .optional()
    .describe('File extensions to filter (e.g., ["ts", "js"])'),
  excludePaths: z
    .array(z.string())
    .optional()
    .describe('Paths to exclude (e.g., ["node_modules"])'),
});

type GrepInput = z.infer<typeof GrepSchema>;

interface GrepMatch {
  readonly path: string;
  readonly lineNumber: number;
  readonly column: number;
  readonly matchText: string;
  readonly lineText: string;
  readonly contextBefore?: readonly string[];
  readonly contextAfter?: readonly string[];
}

/**
 * Grep using ripgrep with JSON output
 *
 * Algorithm:
 * 1. Build rg command with --json flag
 * 2. Stream stdout line-by-line
 * 3. Parse JSON Lines format incrementally
 * 4. Collect matches until maxResults
 * 5. Kill process early if limit reached
 *
 * Command: rg <pattern> --json [options]
 */
export const GrepTool: Tool<GrepInput, GrepMatch[]> = {
  name: "Grep",
  description: "Search for text patterns in files using ripgrep",
  schema: GrepSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: GrepInput,
    context: ToolContext,
  ): Promise<ToolResult<GrepMatch[]>> {
    const startTime = Date.now();

    try {
      // Check if ripgrep is available
      const hasRipgrep = await checkRipgrepAvailable();

      if (!hasRipgrep) {
        return {
          success: false,
          error:
            "ripgrep (rg) not found. Please install: https://github.com/BurntSushi/ripgrep",
          metadata: {
            duration: Date.now() - startTime,
            approved: true,
            timestamp: startTime,
          },
        };
      }

      const matches = await grepWithRipgrep(input, context.workspaceRoot);

      return {
        success: true,
        data: matches,
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
 * Check if ripgrep is available
 */
async function checkRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn("rg", ["--version"]);
    rg.on("error", () => resolve(false));
    rg.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Grep using ripgrep
 */
async function grepWithRipgrep(
  input: GrepInput,
  workspaceRoot: string,
): Promise<GrepMatch[]> {
  return new Promise((resolve, reject) => {
    const maxResults = input.maxResults ?? 100;
    const matches: GrepMatch[] = [];

    // Build ripgrep arguments
    const args: string[] = [input.pattern, "--json"];

    // Case sensitivity
    if (input.ignoreCase ?? true) {
      args.push("--ignore-case");
    }

    // Context lines
    if (input.contextLines !== undefined && input.contextLines > 0) {
      args.push("--context", input.contextLines.toString());
    }

    // File type filters
    if (input.fileTypes && input.fileTypes.length > 0) {
      for (const ext of input.fileTypes) {
        args.push("--type-add", `custom:*.${ext}`, "--type", "custom");
      }
    }

    // Exclude paths
    if (input.excludePaths && input.excludePaths.length > 0) {
      for (const excludePath of input.excludePaths) {
        args.push("--glob", `!${excludePath}`);
      }
    }

    // Specific paths to search
    if (input.paths && input.paths.length > 0) {
      args.push(...input.paths);
    }

    // Spawn ripgrep
    const rg = spawn("rg", args, { cwd: workspaceRoot });

    let output = "";
    const contextMap = new Map<string, { before: string[]; after: string[] }>();

    rg.stdout.on("data", (data: Buffer) => {
      output += data.toString();

      // Parse JSON Lines incrementally
      const lines = output.split("\n");
      output = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const json = JSON.parse(line) as RipgrepJsonLine;

          if (
            json.type === "match" &&
            json.data &&
            matches.length < maxResults
          ) {
            const match = parseMatch(json.data, contextMap);
            if (match) {
              matches.push(match);
            }
          } else if (json.type === "context" && json.data) {
            parseContext(json.data, contextMap);
          }
        } catch {
          // Ignore malformed JSON
        }

        // Stop if max results reached
        if (matches.length >= maxResults) {
          rg.kill();
          break;
        }
      }
    });

    let stderr = "";
    rg.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    rg.on("close", (code) => {
      if (code === 0 || code === 1) {
        // 1 = no matches (not an error)
        resolve(matches);
      } else {
        reject(new Error(`ripgrep exited with code ${code}: ${stderr}`));
      }
    });

    rg.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Ripgrep JSON format types
 */
interface RipgrepJsonLine {
  readonly type: "match" | "context" | "begin" | "end";
  readonly data?: RipgrepMatchData | RipgrepContextData;
}

interface RipgrepMatchData {
  readonly path?: { readonly text?: string };
  readonly line_number?: number;
  readonly absolute_offset?: number;
  readonly lines?: { readonly text?: string };
  readonly submatches?: ReadonlyArray<{
    readonly start?: number;
    readonly end?: number;
    readonly match?: { readonly text?: string };
  }>;
}

interface RipgrepContextData {
  readonly path?: { readonly text?: string };
  readonly line_number?: number;
  readonly lines?: { readonly text?: string };
}

/**
 * Parse match from ripgrep JSON
 */
function parseMatch(
  data: RipgrepMatchData,
  contextMap: Map<string, { before: string[]; after: string[] }>,
): GrepMatch | null {
  const path = data.path?.text;
  const lineNumber = data.line_number;
  const lineText = data.lines?.text;

  if (!path || lineNumber === undefined || !lineText) {
    return null;
  }

  // Extract first submatch
  const submatch = data.submatches?.[0];
  const matchText = submatch?.match?.text ?? lineText.trim();
  const column = submatch?.start ?? 0;

  // Get context lines if available
  const context = contextMap.get(`${path}:${lineNumber}`);

  return {
    path,
    lineNumber,
    column,
    matchText,
    lineText: lineText.trimEnd(),
    contextBefore: context?.before,
    contextAfter: context?.after,
  };
}

/**
 * Parse context lines from ripgrep JSON
 */
function parseContext(
  data: RipgrepContextData,
  contextMap: Map<string, { before: string[]; after: string[] }>,
): void {
  const path = data.path?.text;
  const lineNumber = data.line_number;
  const lineText = data.lines?.text;

  if (!path || lineNumber === undefined || !lineText) {
    return;
  }

  // Store context line (will be associated with match later)
  const key = `${path}:${lineNumber}`;
  let context = contextMap.get(key);
  if (!context) {
    context = { before: [], after: [] };
    contextMap.set(key, context);
  }

  // Context lines are emitted before/after the match
  // We'll need to track which is which based on order
  // For simplicity, we store them and let the match pick them up
  context.before.push(lineText.trimEnd());
}
