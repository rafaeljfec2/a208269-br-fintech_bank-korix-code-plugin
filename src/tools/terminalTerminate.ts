/**
 * Terminal session termination tool
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import type { CommandRunner } from "../terminal/commandRunner";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const TerminateSessionSchema = z.object({
  sessionId: z.string().min(1).describe("Terminal session ID to terminate"),
});

type TerminateSessionInput = z.infer<typeof TerminateSessionSchema>;

interface TerminateSessionOutput {
  readonly sessionId: string;
  readonly terminated: true;
}

function metadata(startTime: number): ToolResult["metadata"] {
  return {
    duration: Date.now() - startTime,
    approved: true,
    timestamp: startTime,
  };
}

export const TerminateSessionTool: Tool<
  TerminateSessionInput,
  TerminateSessionOutput
> = {
  name: "TerminateSession",
  description:
    "Terminate an explicit terminal session or background command session by sessionId",
  schema: TerminateSessionSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent";
  },

  requiresApproval(): boolean {
    return true;
  },

  execute(
    input: TerminateSessionInput,
    _context: ToolContext,
  ): Promise<ToolResult<TerminateSessionOutput>> {
    const startTime = Date.now();
    const container = getGlobalContainer();
    const commandRunner = container.get<CommandRunner>(TOKENS.CommandRunner);
    const terminated = commandRunner.terminateSession(input.sessionId);

    if (!terminated) {
      return Promise.resolve({
        success: false,
        error: `Session not found: ${input.sessionId}`,
        metadata: metadata(startTime),
      });
    }

    return Promise.resolve({
      success: true,
      data: {
        sessionId: input.sessionId,
        terminated: true,
      },
      metadata: metadata(startTime),
    });
  },
};
