/**
 * GitStatus Tool - get git status with porcelain v2 format
 *
 * Performance target: < 100ms
 *
 * Uses porcelain v2 format for:
 * - Machine-readable output
 * - Stable parsing
 * - Branch info
 * - Detailed file status
 */

import { spawn } from "child_process";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const GitStatusSchema = z.object({
  includeUntracked: z
    .boolean()
    .optional()
    .describe("Include untracked files (default: true)"),
  includeIgnored: z
    .boolean()
    .optional()
    .describe("Include ignored files (default: false)"),
});

type GitStatusInput = z.infer<typeof GitStatusSchema>;

interface FileStatus {
  readonly path: string;
  readonly status:
    | "modified"
    | "added"
    | "deleted"
    | "renamed"
    | "copied"
    | "untracked"
    | "ignored";
  readonly staged: boolean;
  readonly oldPath?: string; // For renames
}

interface GitStatusResult {
  readonly branch: string;
  readonly upstream?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly files: readonly FileStatus[];
  readonly modified: number;
  readonly staged: number;
  readonly untracked: number;
  readonly conflicted: number;
}

/**
 * Get git status
 *
 * Algorithm:
 * 1. Execute git status --porcelain=v2 --branch
 * 2. Parse structured output
 * 3. Extract branch info and file statuses
 * 4. Return aggregated stats
 *
 * Command: git status --porcelain=v2 --branch
 */
export const GitStatusTool: Tool<GitStatusInput, GitStatusResult> = {
  name: "GitStatus",
  description: "Get git repository status with branch and file info",
  schema: GitStatusSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: GitStatusInput,
    context: ToolContext,
  ): Promise<ToolResult<GitStatusResult>> {
    const startTime = Date.now();

    try {
      const result = await executeGitStatus(input, context.workspaceRoot);

      return {
        success: true,
        data: result,
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
 * Execute git status command
 */
async function executeGitStatus(
  input: GitStatusInput,
  workspaceRoot: string,
): Promise<GitStatusResult> {
  return new Promise((resolve, reject) => {
    const args: string[] = ["status", "--porcelain=v2", "--branch"];

    // Include untracked files (default: true)
    if (input.includeUntracked ?? true) {
      args.push("--untracked-files=normal");
    } else {
      args.push("--untracked-files=no");
    }

    // Include ignored files
    if (input.includeIgnored) {
      args.push("--ignored=traditional");
    }

    const git = spawn("git", args, { cwd: workspaceRoot });

    let stdout = "";
    let stderr = "";

    git.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    git.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    git.on("close", (code) => {
      if (code === 0) {
        const result = parseGitStatus(stdout);
        resolve(result);
      } else {
        reject(new Error(`git status failed: ${stderr}`));
      }
    });

    git.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Parse git status porcelain v2 output
 */
function parseGitStatus(output: string): GitStatusResult {
  const lines = output.split("\n");

  let branch = "main";
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;
  const files: FileStatus[] = [];

  let modified = 0;
  let staged = 0;
  let untracked = 0;
  let conflicted = 0;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    // Branch header (# branch.oid <commit> / # branch.head <branch>)
    if (line.startsWith("# branch.head ")) {
      branch = line.substring("# branch.head ".length);
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = line.substring("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      // Format: # branch.ab +<ahead> -<behind>
      const match = /# branch\.ab \+(\d+) -(\d+)/.exec(line);
      if (match?.[1] && match[2]) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    }
    // Ordinary changed entries (1 <XY> ...)
    else if (line.startsWith("1 ")) {
      const fileStatus = parseOrdinaryEntry(line);
      if (fileStatus) {
        files.push(fileStatus);

        if (fileStatus.staged) {
          staged++;
        }
        if (fileStatus.status === "modified") {
          modified++;
        }
      }
    }
    // Renamed/copied entries (2 <XY> ...)
    else if (line.startsWith("2 ")) {
      const fileStatus = parseRenamedEntry(line);
      if (fileStatus) {
        files.push(fileStatus);
        if (fileStatus.staged) {
          staged++;
        }
      }
    }
    // Untracked entries (? <path>)
    else if (line.startsWith("? ")) {
      const path = line.substring(2);
      files.push({
        path,
        status: "untracked",
        staged: false,
      });
      untracked++;
    }
    // Ignored entries (! <path>)
    else if (line.startsWith("! ")) {
      const path = line.substring(2);
      files.push({
        path,
        status: "ignored",
        staged: false,
      });
    }
    // Unmerged entries (u <XY> ...)
    else if (line.startsWith("u ")) {
      conflicted++;
    }
  }

  return {
    branch,
    upstream,
    ahead,
    behind,
    files,
    modified,
    staged,
    untracked,
    conflicted,
  };
}

/**
 * Parse ordinary entry (1 <XY> ...)
 */
function parseOrdinaryEntry(line: string): FileStatus | null {
  // Format: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  const parts = line.split(" ");
  if (parts.length < 9) {
    return null;
  }

  const xy = parts[1]; // Status codes
  const path = parts.slice(8).join(" ");

  if (!xy || xy.length < 2) {
    return null;
  }

  const stagedChar = xy[0];
  const unstagedChar = xy[1];

  let status: FileStatus["status"] = "modified";
  let isStaged = false;

  if (stagedChar === "M" || unstagedChar === "M") {
    status = "modified";
    isStaged = stagedChar === "M";
  } else if (stagedChar === "A" || unstagedChar === "A") {
    status = "added";
    isStaged = stagedChar === "A";
  } else if (stagedChar === "D" || unstagedChar === "D") {
    status = "deleted";
    isStaged = stagedChar === "D";
  }

  return {
    path,
    status,
    staged: isStaged,
  };
}

/**
 * Parse renamed/copied entry (2 <XY> ...)
 */
function parseRenamedEntry(line: string): FileStatus | null {
  // Format: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
  const parts = line.split(" ");
  if (parts.length < 10) {
    return null;
  }

  const xy = parts[1];
  if (!xy) {
    return null;
  }

  const paths = parts.slice(9).join(" ");
  const [path, oldPath] = paths.split("\t");

  const isRenamed = xy.includes("R");
  const isCopied = xy.includes("C");

  return {
    path: path ?? "",
    oldPath,
    status: isRenamed ? "renamed" : isCopied ? "copied" : "modified",
    staged: true,
  };
}
