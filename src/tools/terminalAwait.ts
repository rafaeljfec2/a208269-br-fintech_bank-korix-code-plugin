/**
 * Await tool for polling background command sessions
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import type { CommandRunner } from "../terminal/commandRunner";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const AwaitSchema = z.object({
  sessionId: z.string().min(1).describe("Background command session ID"),
  pattern: z.string().optional().describe("Regex pattern to wait for"),
  timeout: z
    .number()
    .positive()
    .max(300000)
    .optional()
    .describe("Timeout in milliseconds (default: 60000, max: 300000)"),
  pollInterval: z
    .number()
    .positive()
    .max(10000)
    .optional()
    .describe("Polling interval in milliseconds (default: 1000, max: 10000)"),
});

type AwaitInput = z.infer<typeof AwaitSchema>;

interface AwaitOutput {
  readonly matched: boolean;
  readonly output: string;
  readonly exited: boolean;
  readonly exitCode?: number | null;
  readonly duration: number;
}

function createMetadata(startTime: number): ToolResult["metadata"] {
  return {
    duration: Date.now() - startTime,
    approved: true,
    timestamp: startTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const AwaitTool: Tool<AwaitInput, AwaitOutput> = {
  name: "Await",
  description: `Wait for a background command session to finish or match output.

Usage:
1. Start a command with RunCommand({ command: "npm test", background: true })
2. Poll with Await({ sessionId, pattern: "passed" })

Returns when the pattern matches, the command exits, or the timeout is reached.`,
  schema: AwaitSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent";
  },

  requiresApproval(): boolean {
    return false;
  },

  async execute(
    input: AwaitInput,
    _context: ToolContext,
  ): Promise<ToolResult<AwaitOutput>> {
    const startTime = Date.now();
    const timeout = input.timeout ?? 60000;
    const pollInterval = input.pollInterval ?? 1000;
    let latestOutput = "";
    let latestExitCode: number | null = null;
    let latestExited = false;
    let pattern: RegExp | undefined;

    if (input.pattern) {
      try {
        pattern = new RegExp(input.pattern);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown regex error";
        return {
          success: false,
          error: `Invalid regex pattern: ${message}`,
          metadata: createMetadata(startTime),
        };
      }
    }

    const container = getGlobalContainer();
    const commandRunner = container.get<CommandRunner>(TOKENS.CommandRunner);

    while (Date.now() - startTime < timeout) {
      const status = await commandRunner.getSessionStatus(input.sessionId);

      if (!status) {
        return {
          success: false,
          error: `Session not found: ${input.sessionId}`,
          metadata: createMetadata(startTime),
        };
      }

      latestOutput = status.output;
      latestExitCode = status.exitCode ?? null;
      latestExited = status.exited;

      if (pattern?.test(status.output)) {
        return {
          success: true,
          data: {
            matched: true,
            output: status.output,
            exited: status.exited,
            exitCode: status.exitCode ?? null,
            duration: Date.now() - startTime,
          },
          metadata: createMetadata(startTime),
        };
      }

      if (status.exited) {
        return {
          success: true,
          data: {
            matched: false,
            output: status.output,
            exited: true,
            exitCode: status.exitCode ?? null,
            duration: Date.now() - startTime,
          },
          metadata: createMetadata(startTime),
        };
      }

      const remaining = timeout - (Date.now() - startTime);
      await sleep(Math.min(pollInterval, Math.max(1, remaining)));
    }

    return {
      success: false,
      error: `Timeout waiting for background session: ${input.sessionId}`,
      data: {
        matched: false,
        output: latestOutput,
        exited: latestExited,
        exitCode: latestExitCode,
        duration: Date.now() - startTime,
      },
      metadata: createMetadata(startTime),
    };
  },
};
