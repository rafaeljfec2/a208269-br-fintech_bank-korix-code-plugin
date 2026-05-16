/**
 * Terminal tool - RunCommand
 */

import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../harness/toolRegistry';
import { getCommandRunner } from '../terminal/commandRunner';

const RunCommandInputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
  sessionId: z.string().optional().describe('Session ID to reuse (optional)'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  cwd: z.string().optional().describe('Working directory (optional)'),
});

type RunCommandInput = z.infer<typeof RunCommandInputSchema>;

export const RunCommandTool: Tool<RunCommandInput, string> = {
  name: 'RunCommand',
  description: `Execute a shell command in a persistent terminal session.

Security:
- Commands matching denylist patterns will be blocked
- Destructive commands require approval
- Commands timeout after specified duration (default: 30s, max: 5min)

Examples:
- npm install
- git status
- python script.py
- ls -la`,

  schema: RunCommandInputSchema,

  async execute(input: RunCommandInput, _context: ToolContext): Promise<ToolResult<string>> {
    const commandRunner = getCommandRunner();

    const validation = commandRunner.validateCommand(input.command);

    if (!validation.allowed) {
      return {
        success: false,
        error: validation.reason ?? 'Command not allowed',
      };
    }

    try {
      const result = await commandRunner.run(input.command, {
        sessionId: input.sessionId,
        timeout: input.timeout,
        cwd: input.cwd,
      });

      if (result.timedOut) {
        return {
          success: false,
          error: `Command timed out after ${result.duration}ms`,
          data: result.stdout,
        };
      }

      return {
        success: true,
        data: result.stdout,
        metadata: {
          duration: result.duration,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  },

  requiresApproval(input: RunCommandInput, _context: ToolContext): boolean {
    const commandRunner = getCommandRunner();
    const validation = commandRunner.validateCommand(input.command);
    return validation.requiresApproval ?? false;
  },

  allowedInMode(mode): boolean {
    return mode === 'agent';
  },
};
