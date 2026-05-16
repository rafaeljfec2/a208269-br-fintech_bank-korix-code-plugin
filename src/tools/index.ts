/**
 * Tool registration - register all available tools
 */

import { globalToolRegistry } from '../harness/toolRegistry';
import { ReadFileTool } from './filesystem';
import { RunCommandTool } from './terminal';
import { getLogger } from '../telemetry/logger';

export function registerAllTools(): void {
  const logger = getLogger();

  const tools = [ReadFileTool, RunCommandTool];

  for (const tool of tools) {
    globalToolRegistry.register(tool);
    logger.debug('Tool registered', { name: tool.name });
  }

  logger.info('All tools registered', { count: tools.length });
}
