/**
 * Tests for ToolRegistry
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../toolRegistry";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../toolRegistry";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  const createMockTool = (name: string): Tool<{ value: string }, string> => ({
    name,
    description: `Test tool ${name}`,
    schema: z.object({ value: z.string() }),
    async execute(
      input: { value: string },
      _context: ToolContext,
    ): Promise<ToolResult<string>> {
      return {
        success: true,
        data: `processed: ${input.value}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    },
  });

  describe("register", () => {
    it("should register a tool", () => {
      const tool = createMockTool("test");
      registry.register(tool);

      expect(registry.has("test")).toBe(true);
    });

    it("should throw when registering duplicate tool", () => {
      const tool = createMockTool("test");
      registry.register(tool);

      expect(() => registry.register(tool)).toThrow("Tool already registered");
    });
  });

  describe("get", () => {
    it("should retrieve registered tool", () => {
      const tool = createMockTool("test");
      registry.register(tool);

      const retrieved = registry.get("test");
      expect(retrieved).toBe(tool);
    });

    it("should return undefined for non-existent tool", () => {
      const retrieved = registry.get("nonexistent");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should list all registered tools", () => {
      const tool1 = createMockTool("tool1");
      const tool2 = createMockTool("tool2");

      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.list();
      expect(tools).toHaveLength(2);
      expect(tools.some((t) => t.name === "tool1")).toBe(true);
      expect(tools.some((t) => t.name === "tool2")).toBe(true);
    });
  });

  describe("unregister", () => {
    it("should remove a registered tool", () => {
      const tool = createMockTool("test");
      registry.register(tool);

      expect(registry.has("test")).toBe(true);

      const removed = registry.unregister("test");
      expect(removed).toBe(true);
      expect(registry.has("test")).toBe(false);
    });

    it("should return false when removing non-existent tool", () => {
      const removed = registry.unregister("nonexistent");
      expect(removed).toBe(false);
    });
  });
});
