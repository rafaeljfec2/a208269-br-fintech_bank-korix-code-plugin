/**
 * Safe filesystem delete tool
 */

import * as path from "path";
import * as vscode from "vscode";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const DeleteFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Absolute or workspace-relative path to delete"),
  recursive: z
    .boolean()
    .optional()
    .describe("Delete directories recursively. Defaults to true."),
});

type DeleteFileInput = z.infer<typeof DeleteFileSchema>;

interface DeleteFileOutput {
  readonly path: string;
  readonly deleted: true;
  readonly usedTrash: true;
}

const PROTECTED_ROOT_FILES = [
  ".env",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "package.json",
  "tsconfig.json",
];

const PROTECTED_ROOT_DIRECTORIES = [".git", "node_modules", ".vscode"];

const PROTECTED_ROOT_PATTERNS = [
  /^\.env\..+$/,
  /^tsconfig\..+\.json$/,
  /^vite\.config\..+$/,
  /^vitest\.config\..+$/,
  /^esbuild\.config\..+$/,
];

function createMetadata(approved: boolean): ToolResult["metadata"] {
  return {
    duration: 0,
    approved,
    timestamp: Date.now(),
  };
}

function resolveTargetPath(inputPath: string, workspaceRoot: string): string {
  return path.resolve(
    path.isAbsolute(inputPath)
      ? inputPath
      : path.join(workspaceRoot, inputPath),
  );
}

function getWorkspaceRelativePath(
  targetPath: string,
  workspaceRoot: string,
): string | undefined {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const relativePath = path.relative(resolvedWorkspaceRoot, targetPath);

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return relativePath;
}

function isProtectedPath(relativePath: string): boolean {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const [rootSegment] = normalizedPath.split("/");

  if (!rootSegment) {
    return true;
  }

  if (PROTECTED_ROOT_DIRECTORIES.includes(rootSegment)) {
    return true;
  }

  if (normalizedPath.includes("/")) {
    return false;
  }

  return (
    PROTECTED_ROOT_FILES.includes(rootSegment) ||
    PROTECTED_ROOT_PATTERNS.some((pattern) => pattern.test(rootSegment))
  );
}

function failure(error: string): ToolResult<DeleteFileOutput> {
  return {
    success: false,
    error,
    metadata: createMetadata(false),
  };
}

export const DeleteFileTool: Tool<DeleteFileInput, DeleteFileOutput> = {
  name: "DeleteFile",
  description:
    "Delete a file or directory inside the workspace using the operating system trash",
  schema: DeleteFileSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent";
  },

  requiresApproval(): boolean {
    return true;
  },

  async execute(
    input: DeleteFileInput,
    context: ToolContext,
  ): Promise<ToolResult<DeleteFileOutput>> {
    const targetPath = resolveTargetPath(input.path, context.workspaceRoot);
    const relativePath = getWorkspaceRelativePath(
      targetPath,
      context.workspaceRoot,
    );

    if (!relativePath) {
      return failure(`Cannot delete path outside the workspace: ${input.path}`);
    }

    if (isProtectedPath(relativePath)) {
      return failure(`Cannot delete protected path: ${relativePath}`);
    }

    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), {
        recursive: input.recursive ?? true,
        useTrash: true,
      });

      return {
        success: true,
        data: {
          path: targetPath,
          deleted: true,
          usedTrash: true,
        },
        metadata: createMetadata(true),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown filesystem error";
      return failure(`Failed to delete file: ${message}`);
    }
  },
};
