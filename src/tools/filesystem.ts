/**
 * Filesystem tools for reading, writing, and managing files
 */

import * as vscode from "vscode";
import * as path from "path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";

// ReadFile Tool
const ReadFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file"),
  encoding: z.enum(["utf-8", "utf8", "base64"]).optional(),
});

type ReadFileInput = z.infer<typeof ReadFileSchema>;

export const ReadFileTool: Tool<ReadFileInput, string> = {
  name: "ReadFile",
  description: "Read the contents of a file",
  schema: ReadFileSchema,

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: ReadFileInput,
    context: ToolContext,
  ): Promise<ToolResult<string>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);

      const uri = vscode.Uri.file(absolutePath);
      const content = await vscode.workspace.fs.readFile(uri);

      const encoding = input.encoding ?? "utf-8";
      const text =
        encoding === "base64"
          ? Buffer.from(content).toString("base64")
          : Buffer.from(content).toString("utf-8");

      return {
        success: true,
        data: text,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to read file: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }
  },
};

// WriteFile Tool
const WriteFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file"),
  content: z.string().describe("Content to write to the file"),
  createDirectories: z.boolean().optional(),
});

type WriteFileInput = z.infer<typeof WriteFileSchema>;

export const WriteFileTool: Tool<WriteFileInput, void> = {
  name: "WriteFile",
  description: "Write content to a file",
  schema: WriteFileSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent"; // Only in agent mode
  },

  requiresApproval(): boolean {
    return true;
  },

  async execute(
    input: WriteFileInput,
    context: ToolContext,
  ): Promise<ToolResult<void>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);

      const uri = vscode.Uri.file(absolutePath);
      const createDirectories = input.createDirectories ?? true;

      if (createDirectories) {
        const dir = path.dirname(absolutePath);
        const dirUri = vscode.Uri.file(dir);
        await vscode.workspace.fs.createDirectory(dirUri);
      }

      const content = Buffer.from(input.content, "utf-8");
      await vscode.workspace.fs.writeFile(uri, content);

      return {
        success: true,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to write file: ${err.message}`,
        metadata: {
          duration: 0,
          approved: false,
          timestamp: Date.now(),
        },
      };
    }
  },
};

// ListDirectory Tool
const ListDirectorySchema = z.object({
  path: z.string().describe("Directory path to list"),
  recursive: z.boolean().optional(),
});

type ListDirectoryInput = z.infer<typeof ListDirectorySchema>;

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
}

export const ListDirectoryTool: Tool<ListDirectoryInput, FileEntry[]> = {
  name: "ListDirectory",
  description: "List files and directories in a directory",
  schema: ListDirectorySchema,

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true;
  },

  async execute(
    input: ListDirectoryInput,
    context: ToolContext,
  ): Promise<ToolResult<FileEntry[]>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);

      const uri = vscode.Uri.file(absolutePath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      const result: FileEntry[] = entries.map(([name, type]) => ({
        name,
        type: type === vscode.FileType.Directory ? "directory" : "file",
      }));

      return {
        success: true,
        data: result,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to list directory: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }
  },
};
