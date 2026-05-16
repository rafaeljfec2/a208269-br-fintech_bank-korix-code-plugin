/**
 * Execution engine for orchestrating provider and tools
 */

import type { AIProvider, StreamChunk } from "../../providers/types";
import type { ToolRegistry } from "../../harness/toolRegistry";
import type { Message } from "../types";
import { globalPermissionManager } from "../../harness/permissions";
import { getPolicyForTool } from "../../harness/executionPolicy";

export interface ExecutionEngineOptions {
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  workspaceRoot: string;
  mode: "ask" | "plan" | "agent";
}

export interface ExecutionResult {
  success: boolean;
  messages: Message[];
  toolCallsExecuted: number;
  error?: string;
}

export class ExecutionEngine {
  private provider: AIProvider;
  private toolRegistry: ToolRegistry;
  private workspaceRoot: string;
  private mode: "ask" | "plan" | "agent";

  constructor(options: ExecutionEngineOptions) {
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.workspaceRoot = options.workspaceRoot;
    this.mode = options.mode;
  }

  async *execute(
    messages: Message[],
  ): AsyncGenerator<StreamChunk, ExecutionResult> {
    const executedToolCalls: Message[] = [];
    let toolCallsExecuted = 0;

    try {
      // Get available tools for current mode
      const tools = this.toolRegistry.toProviderDefinitions(this.mode);

      // Send to provider
      const stream = this.provider.send({
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      for await (const chunk of stream) {
        // Yield chunk to caller
        yield chunk;

        // Handle tool calls
        if (chunk.type === "tool_use") {
          const tool = this.toolRegistry.get(chunk.name);

          if (!tool) {
            const errorMessage: Message = {
              role: "tool",
              content: JSON.stringify({
                error: `Tool not found: ${chunk.name}`,
              }),
              timestamp: Date.now(),
            };
            executedToolCalls.push(errorMessage);
            continue;
          }

          // Check approval
          const policy = getPolicyForTool(chunk.name);
          if (policy.requiresApproval) {
            const riskLevel =
              policy.riskLevel === "critical" ? "high" : policy.riskLevel;
            const approved = await globalPermissionManager.requestApproval(
              chunk.name,
              chunk.input,
              `Execute ${chunk.name}`,
              riskLevel,
            );

            if (!approved) {
              const errorMessage: Message = {
                role: "tool",
                content: JSON.stringify({
                  error: "Tool execution rejected by user",
                }),
                timestamp: Date.now(),
              };
              executedToolCalls.push(errorMessage);
              continue;
            }
          }

          // Execute tool
          const result = await this.toolRegistry.execute(
            chunk.name,
            chunk.input,
            {
              execution: {
                mode: this.mode,
                workspaceRoot: this.workspaceRoot,
                openFiles: [],
              },
              workspaceRoot: this.workspaceRoot,
            },
          );

          const toolResultMessage: Message = {
            role: "tool",
            content: JSON.stringify(result),
            timestamp: Date.now(),
          };

          executedToolCalls.push(toolResultMessage);
          toolCallsExecuted++;
        }
      }

      return {
        success: true,
        messages: [...messages, ...executedToolCalls],
        toolCallsExecuted,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        messages: [...messages, ...executedToolCalls],
        toolCallsExecuted,
        error: err.message,
      };
    }
  }
}
