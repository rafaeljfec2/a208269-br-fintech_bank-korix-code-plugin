/**
 * Tool registration - register all available tools
 */

import { globalToolRegistry, type Tool } from '../harness/toolRegistry';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from './filesystem';
import { RunCommandTool } from './terminal';
import { EditFileTool } from './edit';
import { getLogger } from '../telemetry/logger';

export function registerAllTools(): void {
  const logger = getLogger();

  const tools: Tool<unknown, unknown>[] = [
    ReadFileTool,
    WriteFileTool,
    ListDirectoryTool,
    RunCommandTool,
    EditFileTool,
  ];

  for (const tool of tools) {
    globalToolRegistry.register(tool);
    logger.debug('Tool registered', { name: tool.name });
  }

  logger.info('All tools registered', { count: tools.length });
}
