/**
 * Terminal tool - RunCommand
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import type { CommandRunner } from "../terminal/commandRunner";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const RunCommandInputSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute"),
  sessionId: z.string().optional().describe("Session ID to reuse (optional)"),
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default: 30000)"),
  cwd: z.string().optional().describe("Working directory (optional)"),
  background: z
    .boolean()
    .optional()
    .describe("Run in background and return a sessionId immediately"),
});

type RunCommandInput = z.infer<typeof RunCommandInputSchema>;

interface RunCommandOutput {
  readonly stdout: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly sessionId?: string;
  readonly background?: boolean;
}

export const RunCommandTool: Tool<RunCommandInput, RunCommandOutput> = {
  name: "RunCommand",
  description: `Execute a shell command in a persistent terminal session.

Security:
- Commands matching denylist patterns will be blocked
- Destructive commands require approval
- Commands timeout after specified duration (default: 30s, max: 5min)
- Background mode returns a sessionId immediately for long-running commands

Examples:
- npm install
- git status
- python script.py
- ls -la`,

  schema: RunCommandInputSchema,

  async execute(
    input: RunCommandInput,
    context: ToolContext,
  ): Promise<ToolResult<RunCommandOutput>> {
    const container = getGlobalContainer();
    const commandRunner = container.get<CommandRunner>(TOKENS.CommandRunner);

    const validation = commandRunner.validateCommand(input.command);

    if (!validation.allowed) {
      return {
        success: false,
        error: validation.reason ?? "Command not allowed",
      };
    }

    try {
      const result = await commandRunner.run(input.command, {
        sessionId: input.sessionId,
        timeout: input.timeout,
        cwd:
          input.cwd ??
          (context.workspaceRoot.length > 0 ? context.workspaceRoot : undefined),
        env: {
          GIT_PAGER: "cat",
          PAGER: "cat",
        },
        background: input.background,
      });

      const output: RunCommandOutput = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        sessionId: result.sessionId,
        background: result.background,
      };

      if (result.timedOut) {
        return {
          success: false,
          error: `Command timed out after ${result.duration}ms`,
          data: output,
        };
      }

      if (result.exitCode !== null && result.exitCode !== 0) {
        const details = [result.stderr, result.stdout]
          .filter((item) => item.trim().length > 0)
          .join("\n")
          .trim();

        return {
          success: false,
          error:
            details.length > 0
              ? `Command exited with code ${result.exitCode}: ${details}`
              : `Command exited with code ${result.exitCode}`,
          data: output,
          metadata: {
            duration: result.duration,
            approved: true,
            timestamp: Date.now(),
          },
        };
      }

      return {
        success: true,
        data: output,
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
    const container = getGlobalContainer();
    const commandRunner = container.get<CommandRunner>(TOKENS.CommandRunner);
    const validation = commandRunner.validateCommand(input.command);
    return validation.requiresApproval ?? false;
  },

  allowedInMode(mode): boolean {
    return mode === "agent";
  },
};
