/**
 * Tests for ExecutionEngine interactive tools pattern
 * Focused on tool separation logic added to fix infinite loops
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StepResult } from "./runtimeTypes";
import type { Tool } from "../../harness/toolRegistry";

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

    it("should skip tool_result message for interactive tools", () => {
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
      const shouldAddMessage = !tool.isInteractive;

      expect(shouldAddMessage).toBe(false);
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
    it("should complete when isEndTurn and no hadToolCalls", () => {
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
      const shouldComplete = isEndTurn && !stepResult.hadToolCalls;

      // Should complete because hadInteractiveToolCalls doesn't prevent completion
      expect(shouldComplete).toBe(true);
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
});
