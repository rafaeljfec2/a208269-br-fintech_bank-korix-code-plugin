/**
 * Tool registration - register all available tools
 */

import { globalToolRegistry, type Tool } from "../harness/toolRegistry";
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from "./filesystem";
import { RunCommandTool } from "./terminal";
import { AwaitTool } from "./terminalAwait";
import { TaskTool } from "./task";
import { TodoWriteTool } from "./todoWrite";
import { GlobTool } from "./filesystem/glob";
import { EditFileTool } from "./edit";
import { GitStatusTool } from "./git/gitStatus";
import { GitDiffTool } from "./git/gitDiff";
import { ChangedFilesTool } from "./git/changedFiles";
import { GrepTool } from "./search/grep";
import { FindReferencesTool } from "./search/findReferences";
import { FindSymbolsTool } from "./search/findSymbols";
import { FileChunksTool } from "./filesystem/fileChunks";
import { SearchFilesTool } from "./filesystem/searchFiles";
import { DeleteFileTool } from "./filesystem/deleteFile";
import { WebFetchTool } from "./web";
import { ProblemsTool } from "./diagnostics/problems";
import { WorkspaceGraphTool } from "./workspace/workspaceGraph";
import {
  GetDiagnosticsTool,
  GetOpenFilesTool,
  GetCurrentFileTool,
  OpenFileTool,
} from "./workspace";
import { AskUserQuestionTool } from "./askUserQuestion";
import { getLogger } from "../telemetry/logger";

export function registerAllTools(): void {
  const logger = getLogger();

  const tools: Tool<unknown, unknown>[] = [
    // Filesystem tools
    ReadFileTool,
    WriteFileTool,
    ListDirectoryTool,
    FileChunksTool,
    SearchFilesTool,
    GlobTool,
    DeleteFileTool,
    WebFetchTool,
    // Terminal tools
    RunCommandTool,
    AwaitTool,
    TaskTool,
    TodoWriteTool,
    // Edit tools
    EditFileTool,
    // Git tools
    GitStatusTool,
    GitDiffTool,
    ChangedFilesTool,
    // Search tools
    GrepTool,
    FindReferencesTool,
    FindSymbolsTool,
    // Diagnostics tools
    ProblemsTool,
    new GetDiagnosticsTool(),
    // Workspace tools
    WorkspaceGraphTool,
    new GetOpenFilesTool(),
    new GetCurrentFileTool(),
    new OpenFileTool(),
    // User interaction tools
    AskUserQuestionTool,
  ];

  for (const tool of tools) {
    globalToolRegistry.register(tool);
    logger.debug("Tool registered", { name: tool.name });
  }

  logger.info("All tools registered", { count: tools.length });
}
