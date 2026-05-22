import { readdir, stat } from "fs/promises";
import * as path from "path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const DEFAULT_IGNORES = ["node_modules/**", ".git/**"];

const GlobSchema = z.object({
  pattern: z.string().trim().min(1).describe("Glob pattern to match"),
  ignore: z.array(z.string()).optional().describe("Glob patterns to ignore"),
  maxResults: z.number().int().min(1).max(5000).optional(),
  followSymlinks: z.boolean().optional(),
});

type GlobInput = z.infer<typeof GlobSchema>;

export const GlobTool: Tool<GlobInput, string[]> = {
  name: "Glob",
  description: `Find files matching glob patterns.

Examples:
- **/*.test.ts
- src/**/*.{ts,tsx}
- ignore: ["dist/**"]`,
  schema: GlobSchema,

  allowedInMode(): boolean {
    return true;
  },

  async execute(
    input: GlobInput,
    context: ToolContext,
  ): Promise<ToolResult<string[]>> {
    const startTime = Date.now();

    try {
      const workspaceRoot = path.resolve(context.workspaceRoot);
      const maxResults = input.maxResults ?? 1000;
      const matcher = createGlobMatcher(input.pattern);
      const ignoreMatchers = [...DEFAULT_IGNORES, ...(input.ignore ?? [])].map(
        createGlobMatcher,
      );
      const results: string[] = [];

      await collectMatches({
        directory: workspaceRoot,
        relativeDirectory: "",
        followSymlinks: input.followSymlinks ?? false,
        matcher,
        ignoreMatchers,
        maxResults,
        results,
      });

      return {
        success: true,
        data: results.sort(),
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Glob failed: ${message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

interface CollectMatchesOptions {
  readonly directory: string;
  readonly relativeDirectory: string;
  readonly followSymlinks: boolean;
  readonly matcher: (filePath: string) => boolean;
  readonly ignoreMatchers: ReadonlyArray<(filePath: string) => boolean>;
  readonly maxResults: number;
  readonly results: string[];
}

async function collectMatches(options: CollectMatchesOptions): Promise<void> {
  if (options.results.length >= options.maxResults) {
    return;
  }

  const entries = await readdir(options.directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (options.results.length >= options.maxResults) {
      return;
    }

    const relativePath = normalizePath(
      path.join(options.relativeDirectory, entry.name),
    );

    if (isIgnored(relativePath, options.ignoreMatchers)) {
      continue;
    }

    const absolutePath = path.join(options.directory, entry.name);
    const entryType = entry.isSymbolicLink()
      ? await resolveSymlinkType(absolutePath, options.followSymlinks)
      : entry.isDirectory()
        ? "directory"
        : "file";

    if (entryType === "directory") {
      await collectMatches({
        ...options,
        directory: absolutePath,
        relativeDirectory: relativePath,
      });
      continue;
    }

    if (entryType === "file" && options.matcher(relativePath)) {
      options.results.push(relativePath);
    }
  }
}

async function resolveSymlinkType(
  absolutePath: string,
  followSymlinks: boolean,
): Promise<"directory" | "file" | "skip"> {
  if (!followSymlinks) {
    return "skip";
  }

  const stats = await stat(absolutePath);
  return stats.isDirectory() ? "directory" : "file";
}

function isIgnored(
  relativePath: string,
  ignoreMatchers: ReadonlyArray<(filePath: string) => boolean>,
): boolean {
  return ignoreMatchers.some(
    (matcher) => matcher(relativePath) || matcher(`${relativePath}/`),
  );
}

function createGlobMatcher(pattern: string): (filePath: string) => boolean {
  const regex = globToRegex(normalizePath(pattern));

  return (filePath: string) => regex.test(normalizePath(filePath));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function globToRegex(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    if (char === "{") {
      const closeIndex = pattern.indexOf("}", index + 1);
      if (closeIndex !== -1) {
        const alternatives = pattern
          .slice(index + 1, closeIndex)
          .split(",")
          .map(escapeRegex)
          .join("|");
        source += `(?:${alternatives})`;
        index = closeIndex;
        continue;
      }
    }

    source += escapeRegex(char ?? "");
  }

  return new RegExp(`^${source}$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
