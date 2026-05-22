import { describe, expect, it, vi } from "vitest";
import type { ToolRegistry } from "../harness/toolRegistry";
import type { Logger } from "../telemetry/logger";

const fsState = vi.hoisted(() => ({
  readCount: 0,
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn((filePath: string) => {
    fsState.readCount += 1;

    if (filePath.endsWith("professional.md")) {
      return [
        "---",
        "name: Test Style",
        "keep-coding-instructions: false",
        "---",
        "# Response Style",
        "Be concise.",
      ].join("\n");
    }

    if (filePath.endsWith("base.md")) {
      return "# Korix Code AI Assistant\nBase prompt.";
    }

    return `# ${filePath}`;
  }),
}));

import { PluginContextBuilder } from "./pluginContext";

describe("PluginContextBuilder", () => {
  it("should build direct prompts without base.md and cache markdown reads", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    const toolRegistry = {
      listForMode: vi.fn(() => []),
    } as unknown as ToolRegistry;
    const builder = new PluginContextBuilder(toolRegistry, logger);

    const first = builder.buildDirectAnswer({
      mode: "agent",
      providerType: "litellm",
      model: "test-model",
      profile: "simple_chat",
    });
    const second = builder.buildDirectAnswer({
      mode: "agent",
      providerType: "litellm",
      model: "test-model",
      profile: "simple_chat",
    });

    expect(first).toBe(second);
    expect(first).not.toContain("Korix Code AI Assistant");
    expect(fsState.readCount).toBe(1);
  });
});
