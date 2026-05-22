import { beforeEach, describe, expect, it, vi } from "vitest";
import * as path from "path";
import { createMockToolContext } from "../../__tests__/factories/toolContext.factory";
import { ToolRegistry, globalToolRegistry } from "../../harness/toolRegistry";

const vscodeMocks = vi.hoisted(() => ({
  deleteFile: vi.fn(async () => undefined),
}));

vi.mock("vscode", () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
  },
  workspace: {
    fs: {
      delete: vscodeMocks.deleteFile,
    },
  },
}));

vi.mock("../../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { DeleteFileTool } from "./deleteFile";
import { registerAllTools } from "../index";

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("DeleteFileTool", () => {
  beforeEach(() => {
    vscodeMocks.deleteFile.mockClear();
    resetGlobalRegistry();
  });

  it("should delete a workspace-relative file using trash", async () => {
    const result = await DeleteFileTool.execute(
      { path: "src/oldFile.ts" },
      createMockToolContext({ workspaceRoot: "/test/workspace" }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      path: "/test/workspace/src/oldFile.ts",
      deleted: true,
      usedTrash: true,
    });
    expect(vscodeMocks.deleteFile).toHaveBeenCalledWith(
      {
        fsPath: "/test/workspace/src/oldFile.ts",
        path: "/test/workspace/src/oldFile.ts",
      },
      { recursive: true, useTrash: true },
    );
  });

  it("should delete an absolute in-workspace directory recursively using trash", async () => {
    const result = await DeleteFileTool.execute(
      { path: "/test/workspace/src/obsolete", recursive: true },
      createMockToolContext({ workspaceRoot: "/test/workspace" }),
    );

    expect(result.success, result.error).toBe(true);
    expect(vscodeMocks.deleteFile).toHaveBeenCalledWith(
      {
        fsPath: "/test/workspace/src/obsolete",
        path: "/test/workspace/src/obsolete",
      },
      { recursive: true, useTrash: true },
    );
  });

  it("should reject paths outside the workspace", async () => {
    const result = await DeleteFileTool.execute(
      { path: "../outside.txt" },
      createMockToolContext({ workspaceRoot: "/test/workspace" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the workspace");
    expect(vscodeMocks.deleteFile).not.toHaveBeenCalled();
  });

  it("should reject sibling paths that share the workspace string prefix", async () => {
    const siblingPath = path.join("/tmp", "workspace-backup", "file.ts");

    const result = await DeleteFileTool.execute(
      { path: siblingPath },
      createMockToolContext({ workspaceRoot: "/tmp/workspace" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("outside the workspace");
    expect(vscodeMocks.deleteFile).not.toHaveBeenCalled();
  });

  it.each([
    ".git",
    ".git/config",
    "node_modules",
    "node_modules/pkg/index.js",
    ".env",
    ".env.local",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "package.json",
    "tsconfig.json",
    "tsconfig.app.json",
    "vite.config.ts",
    "vitest.config.ts",
    "esbuild.config.js",
    ".vscode",
    ".vscode/settings.json",
  ])("should reject protected path %s", async (protectedPath) => {
    const result = await DeleteFileTool.execute(
      { path: protectedPath },
      createMockToolContext({ workspaceRoot: "/test/workspace" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("protected");
    expect(vscodeMocks.deleteFile).not.toHaveBeenCalled();
  });

  it("should allow nested files that only share a protected root filename", async () => {
    const result = await DeleteFileTool.execute(
      { path: "fixtures/package.json" },
      createMockToolContext({ workspaceRoot: "/test/workspace" }),
    );

    expect(result.success, result.error).toBe(true);
    expect(vscodeMocks.deleteFile).toHaveBeenCalledWith(
      {
        fsPath: "/test/workspace/fixtures/package.json",
        path: "/test/workspace/fixtures/package.json",
      },
      { recursive: true, useTrash: true },
    );
  });

  it("should only be available in agent mode", () => {
    expect(DeleteFileTool.allowedInMode?.("ask")).toBe(false);
    expect(DeleteFileTool.allowedInMode?.("plan")).toBe(false);
    expect(DeleteFileTool.allowedInMode?.("agent")).toBe(true);
  });

  it("should always require approval", () => {
    expect(
      DeleteFileTool.requiresApproval?.(
        { path: "src/oldFile.ts" },
        createMockToolContext(),
      ),
    ).toBe(true);
  });

  it("should be registered by registerAllTools", () => {
    registerAllTools();

    expect(globalToolRegistry.has("DeleteFile")).toBe(true);
  });

  it("should not cache registry executions", async () => {
    const registry = new ToolRegistry();
    registry.register(DeleteFileTool);
    const context = createMockToolContext({ workspaceRoot: "/test/workspace" });

    const first = await registry.execute(
      "DeleteFile",
      { path: "tmp/a.ts" },
      context,
    );
    const second = await registry.execute(
      "DeleteFile",
      { path: "tmp/a.ts" },
      context,
    );

    expect(first.success, first.error).toBe(true);
    expect(second.success, second.error).toBe(true);
    expect(first.metadata?.cached).toBe(false);
    expect(second.metadata?.cached).toBe(false);
    expect(vscodeMocks.deleteFile).toHaveBeenCalledTimes(2);
  });
});
