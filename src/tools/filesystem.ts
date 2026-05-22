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
  encoding: z.enum(["utf-8", "utf8", "base64", "image"]).optional(),
  imageMetadata: z.boolean().optional(),
});

type ReadFileInput = z.infer<typeof ReadFileSchema>;

type ImageFormat = "png" | "jpeg" | "gif" | "webp";

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface ReadFileImageOutput {
  readonly image: {
    readonly base64: string;
    readonly format: ImageFormat;
    readonly width: number;
    readonly height: number;
    readonly size: number;
  };
}

type ReadFileOutput = string | ReadFileImageOutput;

export const ReadFileTool: Tool<ReadFileInput, ReadFileOutput> = {
  name: "ReadFile",
  description:
    "Read the contents of a file. Supports utf-8, base64, and image metadata reads for PNG, JPEG, GIF, and WebP.",
  schema: ReadFileSchema,

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: ReadFileInput,
    context: ToolContext,
  ): Promise<ToolResult<ReadFileOutput>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);

      const uri = vscode.Uri.file(absolutePath);
      const content = await vscode.workspace.fs.readFile(uri);

      const encoding = input.encoding ?? "utf-8";
      const imageFormat = getImageFormat(absolutePath);
      if (encoding === "image" && imageFormat) {
        const dimensions = parseImageDimensions(content, imageFormat);

        return {
          success: true,
          data: {
            image: {
              base64: Buffer.from(content).toString("base64"),
              format: imageFormat,
              width: dimensions.width,
              height: dimensions.height,
              size: content.byteLength,
            },
          },
          metadata: {
            duration: 0,
            approved: true,
            timestamp: Date.now(),
          },
        };
      }

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

function getImageFormat(filePath: string): ImageFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") {
    return "png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "jpeg";
  }
  if (ext === ".gif") {
    return "gif";
  }
  if (ext === ".webp") {
    return "webp";
  }

  return undefined;
}

function parseImageDimensions(
  buffer: Uint8Array,
  format: ImageFormat,
): ImageDimensions {
  switch (format) {
    case "png":
      return parsePngDimensions(buffer);
    case "jpeg":
      return parseJpegDimensions(buffer);
    case "gif":
      return parseGifDimensions(buffer);
    case "webp":
      return { width: 0, height: 0 };
  }
}

function parsePngDimensions(buffer: Uint8Array): ImageDimensions {
  const bytes = Buffer.from(buffer);
  if (bytes.length < 24) {
    return { width: 0, height: 0 };
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function parseJpegDimensions(buffer: Uint8Array): ImageDimensions {
  const bytes = Buffer.from(buffer);
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker !== undefined && sofMarkers.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    if (offset + 3 >= bytes.length) {
      break;
    }

    const segmentLength = bytes.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }

  return { width: 0, height: 0 };
}

function parseGifDimensions(buffer: Uint8Array): ImageDimensions {
  const bytes = Buffer.from(buffer);
  if (bytes.length < 10) {
    return { width: 0, height: 0 };
  }

  return {
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
}

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
