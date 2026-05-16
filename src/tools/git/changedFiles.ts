/**
 * ChangedFiles Tool - get files changed since base branch
 *
 * Performance target: < 200ms
 *
 * Uses git diff for:
 * - Fast change tracking
 * - Integration with context ranking
 * - Recently modified files have higher relevance
 */

import { spawn } from 'child_process';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../../harness/toolRegistry';

const ChangedFilesSchema = z.object({
  baseBranch: z.string().optional().describe('Base branch to compare against (default: main)'),
  includeUntracked: z.boolean().optional().describe('Include untracked files (default: true)'),
  statusFilter: z.array(z.enum(['added', 'modified', 'deleted', 'renamed'])).optional()
    .describe('Filter by file status'),
});

type ChangedFilesInput = z.infer<typeof ChangedFilesSchema>;

interface ChangedFile {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly oldPath?: string; // For renamed files
  readonly insertions?: number;
  readonly deletions?: number;
}

/**
 * Get changed files since base branch
 *
 * Algorithm:
 * 1. Detect default branch if not specified
 * 2. Execute git diff --name-status <base>...HEAD
 * 3. Parse status codes (A, M, D, R)
 * 4. Optionally get stats with --numstat
 * 5. Return structured file list
 *
 * Command: git diff --name-status <base>...HEAD
 */
export const ChangedFilesTool: Tool<ChangedFilesInput, ChangedFile[]> = {
  name: 'ChangedFiles',
  description: 'Get files changed since base branch for context ranking',
  schema: ChangedFilesSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: ChangedFilesInput,
    context: ToolContext
  ): Promise<ToolResult<ChangedFile[]>> {
    const startTime = Date.now();

    try {
      const files = await getChangedFiles(input, context.workspaceRoot);

      return {
        success: true,
        data: files,
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
 * Get changed files
 */
async function getChangedFiles(
  input: ChangedFilesInput,
  workspaceRoot: string
): Promise<ChangedFile[]> {
  // Detect base branch if not specified
  const baseBranch = input.baseBranch ?? await detectBaseBranch(workspaceRoot);

  // Get changed files with status
  const changedFiles = await gitDiffNameStatus(baseBranch, workspaceRoot);

  // Get untracked files if requested
  if (input.includeUntracked ?? true) {
    const untracked = await getUntrackedFiles(workspaceRoot);
    changedFiles.push(...untracked);
  }

  // Filter by status if specified
  if (input.statusFilter && input.statusFilter.length > 0) {
    return changedFiles.filter(f => input.statusFilter!.includes(f.status));
  }

  return changedFiles;
}

/**
 * Detect base branch (main or master)
 */
async function detectBaseBranch(workspaceRoot: string): Promise<string> {
  return new Promise((resolve) => {
    const git = spawn('git', ['rev-parse', '--verify', 'main'], { cwd: workspaceRoot });

    git.on('close', (code) => {
      if (code === 0) {
        resolve('main');
      } else {
        // Try master
        const gitMaster = spawn('git', ['rev-parse', '--verify', 'master'], { cwd: workspaceRoot });
        gitMaster.on('close', (masterCode) => {
          resolve(masterCode === 0 ? 'master' : 'main');
        });
      }
    });
  });
}

/**
 * Get changed files with git diff --name-status
 */
async function gitDiffNameStatus(
  baseBranch: string,
  workspaceRoot: string
): Promise<ChangedFile[]> {
  return new Promise((resolve, reject) => {
    const args = ['diff', '--name-status', `${baseBranch}...HEAD`];
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
        const files = parseNameStatus(stdout);
        resolve(files);
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
 * Parse git diff --name-status output
 *
 * Format:
 * A       file.txt        (added)
 * M       file.txt        (modified)
 * D       file.txt        (deleted)
 * R100    old.txt new.txt (renamed)
 */
function parseNameStatus(output: string): ChangedFile[] {
  const lines = output.split('\n').filter(line => line.trim());
  const files: ChangedFile[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) {
      continue;
    }

    const statusCode = parts[0];
    const path = parts[1];

    if (!statusCode || !path) {
      continue;
    }

    let status: ChangedFile['status'] = 'modified';
    let oldPath: string | undefined;

    if (statusCode.startsWith('A')) {
      status = 'added';
    } else if (statusCode.startsWith('M')) {
      status = 'modified';
    } else if (statusCode.startsWith('D')) {
      status = 'deleted';
    } else if (statusCode.startsWith('R')) {
      status = 'renamed';
      oldPath = parts[1];
      const newPath = parts[2];
      if (!newPath) {
        continue;
      }
      files.push({
        path: newPath,
        status,
        oldPath,
      });
      continue;
    }

    files.push({
      path,
      status,
      oldPath,
    });
  }

  return files;
}

/**
 * Get untracked files
 */
async function getUntrackedFiles(workspaceRoot: string): Promise<ChangedFile[]> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['ls-files', '--others', '--exclude-standard'], { cwd: workspaceRoot });

    let stdout = '';

    git.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        const files: ChangedFile[] = stdout
          .split('\n')
          .filter(line => line.trim())
          .map(path => ({
            path,
            status: 'added' as const,
          }));
        resolve(files);
      } else {
        reject(new Error('git ls-files failed'));
      }
    });

    git.on('error', (error) => {
      reject(error);
    });
  });
}
