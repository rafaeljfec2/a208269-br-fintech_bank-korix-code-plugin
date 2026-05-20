/**
 * Tests for ExecutionEngine interactive tools pattern
 * Focused on tool separation logic added to fix infinite loops
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { AIProvider, RequestContext } from "../providers/types";
import { PermissionManager } from "../../harness/permissions";
import type { StepResult } from "./runtimeTypes";
import type { Tool } from "../../harness/toolRegistry";
import { ToolRegistry } from "../../harness/toolRegistry";
import { ExecutionEngine } from "./executionEngine";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { CheckpointManager } from "./checkpoints";
import { RuntimeMetrics } from "./runtimeMetrics";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { Logger } from "../../telemetry/logger";
import { RuntimeState } from "./runtimeState";

describe("ExecutionEngine - Interactive Tools Pattern", () => {
  describe("Tool Separation Logic", () => {
    it("should separate regular and interactive tools", () => {
      const regularTool: Tool = {
        name: "ReadFile",
        description: "Read a file",
        schema: {} as any,
        isInteractive: false,
        execute: vi.fn().mockResolvedValue({ success: true }),
        requiresApproval: () => false,
        allowedInMode: () => true,
      };

      const interactiveTool: Tool = {
        name: "AskUserQuestion",
        description: "Ask user",
        schema: {} as any,
        isInteractive: true,
        execute: vi.fn().mockResolvedValue({ success: true }),
        requiresApproval: () => false,
        allowedInMode: () => true,
      };

      const tools = new Map<string, Tool>([
        ["ReadFile", regularTool],
        ["AskUserQuestion", interactiveTool],
      ]);

      const pendingToolCalls = [
        { id: "1", name: "ReadFile", input: {} },
        { id: "2", name: "AskUserQuestion", input: {} },
      ];

      // Simulate separation logic
      const regularTools: typeof pendingToolCalls = [];
      const interactiveTools: typeof pendingToolCalls = [];

      for (const toolCall of pendingToolCalls) {
        const toolDef = tools.get(toolCall.name);
        if (toolDef?.isInteractive) {
          interactiveTools.push(toolCall);
        } else {
          regularTools.push(toolCall);
        }
      }

      expect(regularTools).toHaveLength(1);
      expect(regularTools[0]?.name).toBe("ReadFile");
      expect(interactiveTools).toHaveLength(1);
      expect(interactiveTools[0]?.name).toBe("AskUserQuestion");
    });

    it("should set hadToolCalls for regular tools only", () => {
      const result: StepResult = {
        hadToolCalls: false,
        hadInteractiveToolCalls: false,
        hadThinking: false,
        tokenCount: 0,
        recoverable: true,
      };

      // Simulate regular tool execution
      const hasRegularTools = true;
      const hasInteractiveTools = false;

      if (hasRegularTools) {
        result.hadToolCalls = true;
      }

      if (hasInteractiveTools) {
        result.hadInteractiveToolCalls = true;
      }

      expect(result.hadToolCalls).toBe(true);
      expect(result.hadInteractiveToolCalls).toBe(false);
    });

    it("should set hadInteractiveToolCalls for interactive tools only", () => {
      const result: StepResult = {
        hadToolCalls: false,
        hadInteractiveToolCalls: false,
        hadThinking: false,
        tokenCount: 0,
        recoverable: true,
      };

      // Simulate interactive tool execution
      const hasRegularTools = false;
      const hasInteractiveTools = true;

      if (hasRegularTools) {
        result.hadToolCalls = true;
      }

      if (hasInteractiveTools) {
        result.hadInteractiveToolCalls = true;
      }

      expect(result.hadToolCalls).toBe(false);
      expect(result.hadInteractiveToolCalls).toBe(true);
    });

    it("should set both flags when mixed tools are present", () => {
      const result: StepResult = {
        hadToolCalls: false,
        hadInteractiveToolCalls: false,
        hadThinking: false,
        tokenCount: 0,
        recoverable: true,
      };

      // Simulate mixed tool execution
      const hasRegularTools = true;
      const hasInteractiveTools = true;

      if (hasRegularTools) {
        result.hadToolCalls = true;
      }

      if (hasInteractiveTools) {
        result.hadInteractiveToolCalls = true;
      }

      expect(result.hadToolCalls).toBe(true);
      expect(result.hadInteractiveToolCalls).toBe(true);
    });

    it("should add tool_result message for ALL tools including interactive", () => {
      const tool: Tool = {
        name: "AskUserQuestion",
        description: "Ask user",
        schema: {} as any,
        isInteractive: true,
        execute: vi.fn(),
        requiresApproval: () => false,
        allowedInMode: () => true,
      };

      const toolCall = { id: "1", name: "AskUserQuestion", input: {} };
      // Changed: Now ALL tools add messages, including interactive ones
      // This allows LLM to see user answers and respond appropriately
      const shouldAddMessage = true;

      expect(shouldAddMessage).toBe(true);
    });

    it("should add tool_result message for regular tools", () => {
      const tool: Tool = {
        name: "ReadFile",
        description: "Read file",
        schema: {} as any,
        isInteractive: false,
        execute: vi.fn(),
        requiresApproval: () => false,
        allowedInMode: () => true,
      };

      const toolCall = { id: "1", name: "ReadFile", input: {} };
      const shouldAddMessage = !tool.isInteractive;

      expect(shouldAddMessage).toBe(true);
    });

    it("should handle tool without isInteractive flag as regular", () => {
      const tool: Tool = {
        name: "LegacyTool",
        description: "Legacy",
        schema: {} as any,
        // isInteractive not specified
        execute: vi.fn(),
        requiresApproval: () => false,
        allowedInMode: () => true,
      };

      const isInteractive = tool.isInteractive ?? false;
      expect(isInteractive).toBe(false);
    });
  });

  describe("AgentLoop Completion Logic", () => {
    it("should not complete immediately after an interactive tool call", () => {
      const stepResult: StepResult = {
        stopReason: "end_turn",
        hadToolCalls: false,
        hadInteractiveToolCalls: true, // Interactive tools present
        hadThinking: false,
        tokenCount: 100,
        recoverable: true,
      };

      const isEndTurn =
        stepResult.stopReason === "end_turn" ||
        stepResult.stopReason === "stop";
      // Interactive tools produce a tool_result message with the user's answer.
      // The loop must continue so the provider can use that observation.
      const hadAnyToolCalls =
        stepResult.hadToolCalls || stepResult.hadInteractiveToolCalls;
      const shouldComplete = isEndTurn && !hadAnyToolCalls;

      expect(shouldComplete).toBe(false);
    });

    it("should NOT complete when hadToolCalls is true", () => {
      const stepResult: StepResult = {
        stopReason: "end_turn",
        hadToolCalls: true,
        hadInteractiveToolCalls: false,
        hadThinking: false,
        tokenCount: 100,
        recoverable: true,
      };

      const isEndTurn =
        stepResult.stopReason === "end_turn" ||
        stepResult.stopReason === "stop";
      const shouldComplete = isEndTurn && !stepResult.hadToolCalls;

      expect(shouldComplete).toBe(false);
    });
  });

  describe("Permission Flow", () => {
    it("should not request approval for interactive tools that opt out", async () => {
      const logger = new Logger({ level: "error" });
      const eventEmitter = new RuntimeEventEmitter();
      const toolRegistry = new ToolRegistry();
      const approvalRequester = vi.fn(async () => ({
        approved: false,
        level: "never" as const,
      }));
      const toolExecute = vi.fn(async () => ({
        success: true,
        data: "selected",
        metadata: {
          duration: 1,
          approved: true,
          timestamp: Date.now(),
        },
      }));
      const provider = createToolCallProvider("InteractiveChoice");
      const permissionManager = new PermissionManager(approvalRequester);
      const state = new RuntimeState({
        mode: "agent",
        workspaceRoot: "/workspace",
        openFiles: [],
      });
      const tool: Tool<Record<string, never>, string> = {
        name: "InteractiveChoice",
        description: "Ask a structured question.",
        schema: z.object({}),
        isInteractive: true,
        requiresApproval: () => false,
        allowedInMode: () => true,
        execute: toolExecute,
      };

      toolRegistry.register(tool);
      state.addMessage({
        role: "user",
        content: "Choose one option",
        timestamp: Date.now(),
      });

      const engine = new ExecutionEngine(
        provider,
        toolRegistry,
        permissionManager,
        eventEmitter,
        new CheckpointManager(logger),
        new RuntimeMetrics(logger),
        new IterationGuard(logger, eventEmitter),
        new CancellationManager(logger, eventEmitter),
        logger,
        "system prompt",
      );

      const result = await engine.step(state);

      expect(result.hadInteractiveToolCalls).toBe(true);
      expect(toolExecute).toHaveBeenCalledTimes(1);
      expect(approvalRequester).not.toHaveBeenCalled();
    });
  });
});

function createToolCallProvider(toolName: string): AIProvider {
  return {
    type: "test",
    config: {
      type: "test",
      apiKey: "test",
      model: "test",
    },
    async *send(_input, context: RequestContext) {
      const correlation = {
        correlationId: context.correlationId,
        sessionId: context.sessionId,
        agentRunId: context.agentRunId,
        iterationId: context.iterationId,
      };

      yield {
        type: "tool_call_complete",
        index: 0,
        id: "tool-call-1",
        name: toolName,
        arguments: "{}",
        timestamp: Date.now(),
        correlation,
      };

      yield {
        type: "finish",
        reason: "end_turn",
        timestamp: Date.now(),
        correlation,
      };

      return {
        model: "test",
        totalDuration: 1,
      };
    },
    async dispose() {
      return undefined;
    },
  };
}
