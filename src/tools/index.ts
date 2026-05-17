/**
 * Tool registration - register all available tools
 */

import { globalToolRegistry, type Tool } from "../harness/toolRegistry";
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from "./filesystem";
import { RunCommandTool } from "./terminal";
import { EditFileTool } from "./edit";
import { GitStatusTool } from "./git/gitStatus";
import { GitDiffTool } from "./git/gitDiff";
import { ChangedFilesTool } from "./git/changedFiles";
import { GrepTool } from "./search/grep";
import { FindReferencesTool } from "./search/findReferences";
import { FindSymbolsTool } from "./search/findSymbols";
import { FileChunksTool } from "./filesystem/fileChunks";
import { SearchFilesTool } from "./filesystem/searchFiles";
import { ProblemsTool } from "./diagnostics/problems";
import { WorkspaceGraphTool } from "./workspace/workspaceGraph";
import {
  GetDiagnosticsTool,
  GetOpenFilesTool,
  GetCurrentFileTool,
} from "./workspace";
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
    // Terminal tools
    RunCommandTool,
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
  ];

  for (const tool of tools) {
    globalToolRegistry.register(tool);
    logger.debug("Tool registered", { name: tool.name });
  }

  logger.info("All tools registered", { count: tools.length });
}
