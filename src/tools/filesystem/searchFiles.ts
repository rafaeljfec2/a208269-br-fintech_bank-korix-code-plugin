/**
 * SearchFiles Tool - ripgrep-based file search with streaming
 *
 * Performance target: < 200ms for 1000 files
 *
 * Uses ripgrep (rg) for:
 * - 10-100x faster than Node fs traversal
 * - SIMD-optimized regex
 * - Respects .gitignore automatically
 * - Parallel directory walking
 */

import { spawn } from 'child_process';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../../harness/toolRegistry';

const SearchFilesSchema = z.object({
  pattern: z.string().describe('File name pattern (regex or glob)'),
  searchType: z.enum(['name', 'content']).describe('Search by file name or content'),
  includeHidden: z.boolean().optional().describe('Include hidden files'),
  maxResults: z.number().optional().describe('Maximum results (default 100)'),
  fileTypes: z.array(z.string()).optional().describe('File extensions to filter (e.g., ["ts", "js"])'),
  excludePaths: z.array(z.string()).optional().describe('Paths to exclude'),
});

type SearchFilesInput = z.infer<typeof SearchFilesSchema>;

interface FileMatch {
  readonly path: string;
  readonly match?: string; // matched line (if content search)
  readonly lineNumber?: number;
}

/**
 * Search files using ripgrep
 *
 * Algorithm:
 * 1. Check if ripgrep is available (fallback to glob if not)
 * 2. Build rg command based on search type
 * 3. Stream results line-by-line
 * 4. Parse and yield matches incrementally
 *
 * Name search: rg --files | rg <pattern>
 * Content search: rg <pattern> --json
 */
export const SearchFilesTool: Tool<SearchFilesInput, FileMatch[]> = {
  name: 'SearchFiles',
  description: 'Search for files by name or content using ripgrep',
  schema: SearchFilesSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: SearchFilesInput,
    context: ToolContext
  ): Promise<ToolResult<FileMatch[]>> {
    const startTime = Date.now();

    try {
      // Check if ripgrep is available
      const hasRipgrep = await checkRipgrepAvailable();

      if (!hasRipgrep) {
        return {
          success: false,
          error: 'ripgrep (rg) not found. Please install: https://github.com/BurntSushi/ripgrep',
          metadata: {
            duration: Date.now() - startTime,
            approved: true,
            timestamp: startTime,
          },
        };
      }

      const matches = await searchWithRipgrep(input, context.workspaceRoot);

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
 * Check if ripgrep is available in PATH
 */
async function checkRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn('rg', ['--version']);

    rg.on('error', () => resolve(false));
    rg.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Search using ripgrep
 */
async function searchWithRipgrep(
  input: SearchFilesInput,
  workspaceRoot: string
): Promise<FileMatch[]> {
  const maxResults = input.maxResults ?? 100;
  const matches: FileMatch[] = [];

  if (input.searchType === 'name') {
    // File name search: rg --files | rg <pattern>
    await searchFilesByName(input, workspaceRoot, maxResults, matches);
  } else {
    // Content search: rg <pattern> --json
    await searchFilesByContent(input, workspaceRoot, maxResults, matches);
  }

  return matches;
}

/**
 * Search files by name
 *
 * Command: rg --files [options] | rg <pattern>
 */
async function searchFilesByName(
  input: SearchFilesInput,
  workspaceRoot: string,
  maxResults: number,
  matches: FileMatch[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = ['--files'];

    // Add file type filters
    if (input.fileTypes && input.fileTypes.length > 0) {
      for (const ext of input.fileTypes) {
        args.push('--type-add', `custom:*.${ext}`, '--type', 'custom');
      }
    }

    // Include hidden files
    if (input.includeHidden) {
      args.push('--hidden');
    }

    // Exclude paths
    if (input.excludePaths && input.excludePaths.length > 0) {
      for (const excludePath of input.excludePaths) {
        args.push('--glob', `!${excludePath}`);
      }
    }

    const rgFiles = spawn('rg', args, { cwd: workspaceRoot });
    const rgFilter = spawn('rg', [input.pattern], { cwd: workspaceRoot });

    // Pipe rg --files to rg <pattern>
    rgFiles.stdout.pipe(rgFilter.stdin);

    let output = '';

    rgFilter.stdout.on('data', (data: Buffer) => {
      output += data.toString();

      // Parse incrementally
      const lines = output.split('\n');
      output = lines.pop() ?? ''; // Keep incomplete line

      for (const line of lines) {
        if (line.trim() && matches.length < maxResults) {
          matches.push({ path: line.trim() });
        }
      }

      // Stop if max results reached
      if (matches.length >= maxResults) {
        rgFiles.kill();
        rgFilter.kill();
      }
    });

    rgFilter.on('close', (code) => {
      // Process remaining output
      if (output.trim() && matches.length < maxResults) {
        matches.push({ path: output.trim() });
      }

      if (code === 0 || code === 1) {
        // 1 = no matches (not an error)
        resolve();
      } else {
        reject(new Error(`ripgrep exited with code ${code}`));
      }
    });

    rgFilter.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Search files by content
 *
 * Command: rg <pattern> --json [options]
 */
async function searchFilesByContent(
  input: SearchFilesInput,
  workspaceRoot: string,
  maxResults: number,
  matches: FileMatch[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [input.pattern, '--json'];

    // Add file type filters
    if (input.fileTypes && input.fileTypes.length > 0) {
      for (const ext of input.fileTypes) {
        args.push('--type-add', `custom:*.${ext}`, '--type', 'custom');
      }
    }

    // Include hidden files
    if (input.includeHidden) {
      args.push('--hidden');
    }

    // Exclude paths
    if (input.excludePaths && input.excludePaths.length > 0) {
      for (const excludePath of input.excludePaths) {
        args.push('--glob', `!${excludePath}`);
      }
    }

    // Case insensitive by default
    args.push('--ignore-case');

    const rg = spawn('rg', args, { cwd: workspaceRoot });

    let output = '';

    rg.stdout.on('data', (data: Buffer) => {
      output += data.toString();

      // Parse incrementally (JSON Lines format)
      const lines = output.split('\n');
      output = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const json = JSON.parse(line) as {
            type: string;
            data?: {
              path?: { text?: string };
              line_number?: number;
              lines?: { text?: string };
            };
          };

          if (json.type === 'match' && json.data && matches.length < maxResults) {
            const path = json.data.path?.text;
            const lineNumber = json.data.line_number;
            const matchText = json.data.lines?.text?.trim();

            if (path) {
              matches.push({
                path,
                match: matchText,
                lineNumber,
              });
            }
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

    rg.on('close', (code) => {
      if (code === 0 || code === 1) {
        // 1 = no matches
        resolve();
      } else {
        reject(new Error(`ripgrep exited with code ${code}`));
      }
    });

    rg.on('error', (error) => {
      reject(error);
    });
  });
}
