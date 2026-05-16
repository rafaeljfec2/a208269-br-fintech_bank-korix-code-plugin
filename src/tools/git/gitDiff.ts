/**
 * GitDiff Tool - get git diffs with multiple modes
 *
 * Performance target: < 1s for 100 files
 *
 * Modes:
 * - staged: git diff --staged
 * - unstaged: git diff
 * - commit: git diff <range>
 */

import { spawn } from 'child_process';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../../harness/toolRegistry';

const GitDiffSchema = z.object({
  type: z.enum(['staged', 'unstaged', 'commit']).describe('Type of diff'),
  commitRange: z.string().optional().describe('Commit range for commit diff (e.g., "HEAD~3..HEAD")'),
  files: z.array(z.string()).optional().describe('Specific files to diff'),
  contextLines: z.number().optional().describe('Number of context lines (default: 3)'),
});

type GitDiffInput = z.infer<typeof GitDiffSchema>;

interface GitDiffResult {
  readonly diff: string; // Unified diff format
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
}

/**
 * Get git diff
 *
 * Algorithm:
 * 1. Build git diff command based on type
 * 2. Execute and capture stdout
 * 3. Parse diff stats from output
 * 4. Return unified diff + stats
 */
export const GitDiffTool: Tool<GitDiffInput, GitDiffResult> = {
  name: 'GitDiff',
  description: 'Get git diffs (staged, unstaged, or commit range)',
  schema: GitDiffSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: GitDiffInput,
    context: ToolContext
  ): Promise<ToolResult<GitDiffResult>> {
    const startTime = Date.now();

    try {
      const result = await executeGitDiff(input, context.workspaceRoot);

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
 * Execute git diff command
 */
async function executeGitDiff(
  input: GitDiffInput,
  workspaceRoot: string
): Promise<GitDiffResult> {
  return new Promise((resolve, reject) => {
    // Build git diff arguments
    const args: string[] = ['diff'];

    // Add type-specific flags
    if (input.type === 'staged') {
      args.push('--staged');
    } else if (input.type === 'commit') {
      if (!input.commitRange) {
        reject(new Error('commitRange required for commit diff'));
        return;
      }
      args.push(input.commitRange);
    }

    // Add context lines
    if (input.contextLines !== undefined) {
      args.push(`--unified=${input.contextLines}`);
    }

    // Add stats
    args.push('--numstat');
    args.push('--');

    // Add specific files if provided
    if (input.files && input.files.length > 0) {
      args.push(...input.files);
    }

    // Execute git diff
    const git = spawn('git', args, { cwd: workspaceRoot });

    let stdout = '';
    let stderr = '';

    git.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    git.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        // Parse output
        const result = parseDiffOutput(stdout);
        resolve(result);
      } else {
        reject(new Error(`git diff failed: ${stderr}`));
      }
    });

    git.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Parse git diff output
 */
function parseDiffOutput(output: string): GitDiffResult {
  const lines = output.split('\n');

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  const diffLines: string[] = [];

  for (const line of lines) {
    // Parse numstat lines (format: insertions deletions filename)
    const numstatMatch = /^(\d+|-)\s+(\d+|-)\s+(.+)$/.exec(line);
    if (numstatMatch?.[1] && numstatMatch[2]) {
      filesChanged++;
      const ins = numstatMatch[1] === '-' ? 0 : parseInt(numstatMatch[1], 10);
      const del = numstatMatch[2] === '-' ? 0 : parseInt(numstatMatch[2], 10);
      insertions += ins;
      deletions += del;
    } else {
      // Regular diff line
      diffLines.push(line);
    }
  }

  return {
    diff: diffLines.join('\n'),
    filesChanged,
    insertions,
    deletions,
  };
}
