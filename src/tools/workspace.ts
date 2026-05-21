/**
 * Workspace tools for diagnostics, symbols, and editor state
 */

import * as vscode from "vscode";
import * as path from "path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";

// GetDiagnostics Tool
const GetDiagnosticsSchema = z.object({
  uri: z
    .string()
    .optional()
    .describe("File URI to get diagnostics for (optional)"),
});

type GetDiagnosticsInput = z.infer<typeof GetDiagnosticsSchema>;

interface DiagnosticInfo {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
}

export class GetDiagnosticsTool implements Tool<
  GetDiagnosticsInput,
  DiagnosticInfo[]
> {
  name = "GetDiagnostics";
  description = "Get diagnostics (errors, warnings) for files in the workspace";
  schema = GetDiagnosticsSchema;

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true;
  }

  execute(
    input: GetDiagnosticsInput,
    _context: ToolContext,
  ): Promise<ToolResult<DiagnosticInfo[]>> {
    try {
      const diagnostics: DiagnosticInfo[] = [];

      if (input.uri) {
        const uri = vscode.Uri.parse(input.uri);
        const fileDiagnostics = vscode.languages.getDiagnostics(uri);

        for (const diag of fileDiagnostics) {
          diagnostics.push({
            file: uri.fsPath,
            line: diag.range.start.line,
            message: diag.message,
            severity: this.getSeverityString(diag.severity),
          });
        }
      } else {
        const allDiagnostics = vscode.languages.getDiagnostics();

        for (const [uri, fileDiagnostics] of allDiagnostics) {
          for (const diag of fileDiagnostics) {
            diagnostics.push({
              file: uri.fsPath,
              line: diag.range.start.line,
              message: diag.message,
              severity: this.getSeverityString(diag.severity),
            });
          }
        }
      }

      return Promise.resolve({
        success: true,
        data: diagnostics,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      const err = error as Error;
      return Promise.resolve({
        success: false,
        error: `Failed to get diagnostics: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    }
  }

  private getSeverityString(
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
}

// GetOpenFiles Tool
const GetOpenFilesSchema = z.object({});

interface OpenFileInfo {
  path: string;
  isDirty: boolean;
  languageId: string;
}

export class GetOpenFilesTool implements Tool<
  Record<string, never>,
  OpenFileInfo[]
> {
  name = "GetOpenFiles";
  description = "Get list of currently open files in the editor";
  schema = GetOpenFilesSchema;

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true;
  }

  execute(
    _input: Record<string, never>,
    _context: ToolContext,
  ): Promise<ToolResult<OpenFileInfo[]>> {
    try {
      const openFiles: OpenFileInfo[] = vscode.workspace.textDocuments.map(
        (doc) => ({
          path: doc.uri.fsPath,
          isDirty: doc.isDirty,
          languageId: doc.languageId,
        }),
      );

      return Promise.resolve({
        success: true,
        data: openFiles,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      const err = error as Error;
      return Promise.resolve({
        success: false,
        error: `Failed to get open files: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    }
  }
}

// GetCurrentFile Tool
const GetCurrentFileSchema = z.object({});

interface CurrentFileInfo {
  path: string;
  selection?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    text: string;
  };
  languageId: string;
}

export class GetCurrentFileTool implements Tool<
  Record<string, never>,
  CurrentFileInfo | null
> {
  name = "GetCurrentFile";
  description = "Get information about the currently active file and selection";
  schema = GetCurrentFileSchema;

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true;
  }

  execute(
    _input: Record<string, never>,
    _context: ToolContext,
  ): Promise<ToolResult<CurrentFileInfo | null>> {
    try {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return Promise.resolve({
          success: true,
          data: null,
          metadata: {
            duration: 0,
            approved: true,
            timestamp: Date.now(),
          },
        });
      }

      const result: CurrentFileInfo = {
        path: editor.document.uri.fsPath,
        languageId: editor.document.languageId,
      };

      if (!editor.selection.isEmpty) {
        result.selection = {
          start: {
            line: editor.selection.start.line,
            character: editor.selection.start.character,
          },
          end: {
            line: editor.selection.end.line,
            character: editor.selection.end.character,
          },
          text: editor.document.getText(editor.selection),
        };
      }

      return Promise.resolve({
        success: true,
        data: result,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      const err = error as Error;
      return Promise.resolve({
        success: false,
        error: `Failed to get current file: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      });
    }
  }
}

// OpenFile Tool
const OpenFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file to open"),
  preview: z
    .boolean()
    .optional()
    .describe("Whether to open the file as a preview tab"),
});

type OpenFileInput = z.infer<typeof OpenFileSchema>;

interface OpenedFileInfo {
  readonly path: string;
  readonly languageId: string;
}

export class OpenFileTool implements Tool<OpenFileInput, OpenedFileInfo> {
  name = "OpenFile";
  description =
    "Open an existing workspace file in the VS Code editor. Use this when the user asks to open, reveal, or show a file in VS Code.";
  schema = OpenFileSchema;

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent";
  }

  async execute(
    input: OpenFileInput,
    context: ToolContext,
  ): Promise<ToolResult<OpenedFileInfo>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);
      const uri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(uri);

      await vscode.window.showTextDocument(document, {
        preview: input.preview ?? false,
      });

      return {
        success: true,
        data: {
          path: absolutePath,
          languageId: document.languageId,
        },
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
        error: `Failed to open file: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }
  }
}
