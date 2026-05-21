import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ExecutionContext } from "../../types";
import { ToolRegistry } from "../../../harness/toolRegistry";
import type { Tool } from "../../../harness/toolRegistry";
import { WorkspaceEvidenceCollector } from "./WorkspaceEvidenceCollector";
import type { WorkspaceEvidencePlan } from "./types";

interface SearchMatch {
  readonly path: string;
}

interface ChunkInput {
  readonly path: string;
}

interface ChunkOutput {
  readonly chunk: string;
  readonly isComplete: boolean;
}

describe("WorkspaceEvidenceCollector", () => {
  const context: ExecutionContext = {
    mode: "agent",
    workspaceRoot: "/repo",
    openFiles: [],
  };

  const basePlan: WorkspaceEvidencePlan = {
    kind: "read",
    toolNames: ["SearchFiles", "FileChunks"],
    targetHints: [],
    maxFiles: 2,
    maxChunksPerFile: 1,
  };

  it("should read up to maxFiles in deterministic path order", async () => {
    const registry = new ToolRegistry();

    registry.register(createSearchTool(["src/b.ts", "src/a.ts", "src/c.ts"]));
    registry.register(createChunkTool());

    const collection = await new WorkspaceEvidenceCollector(registry).collect({
      message: "leia dois arquivos",
      profile: createProfile(),
      context,
      plan: basePlan,
    });

    expect(collection.success).toBe(true);
    expect(collection.files.map((file) => file.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(collection.omittedFiles).toEqual([
      {
        path: "src/c.ts",
        reason: "max_files",
      },
    ]);
    expect(collection.evidence.providerContext).toContain("src/a.ts");
    expect(collection.evidence.providerContext).toContain("content:src/a.ts");
  });

  it("should skip paths outside the workspace root", async () => {
    const registry = new ToolRegistry();
    const chunkExecute = vi.fn(async (input: ChunkInput) => ({
      success: true,
      data: {
        chunk: `content:${input.path}`,
        isComplete: true,
      },
    }));

    registry.register(createSearchTool(["../secret.ts", "src/a.ts"]));
    registry.register(createChunkTool(chunkExecute));

    const collection = await new WorkspaceEvidenceCollector(registry).collect({
      message: "leia arquivos",
      profile: createProfile(),
      context,
      plan: basePlan,
    });

    expect(collection.files.map((file) => file.path)).toEqual(["src/a.ts"]);
    expect(collection.omittedFiles).toContainEqual({
      path: "../secret.ts",
      reason: "outside_workspace",
    });
    expect(chunkExecute).toHaveBeenCalledTimes(1);
  });

  it("should report failure when no files can be collected", async () => {
    const registry = new ToolRegistry();

    registry.register(createSearchTool([]));

    const collection = await new WorkspaceEvidenceCollector(registry).collect({
      message: "leia arquivos",
      profile: createProfile(),
      context,
      plan: basePlan,
    });

    expect(collection.success).toBe(false);
    expect(collection.error).toBe(
      "No workspace files matched the evidence plan.",
    );
  });
});

function createSearchTool(
  paths: readonly string[],
): Tool<unknown, SearchMatch[]> {
  return {
    name: "SearchFiles",
    description: "Search files.",
    schema: z.object({}),
    execute: vi.fn(async () => ({
      success: true,
      data: paths.map((path) => ({ path })),
    })),
  };
}

function createChunkTool(
  execute = vi.fn(async (input: ChunkInput) => ({
    success: true,
    data: {
      chunk: `content:${input.path}`,
      isComplete: true,
    },
  })),
): Tool<ChunkInput, ChunkOutput> {
  return {
    name: "FileChunks",
    description: "Read chunks.",
    schema: z.object({ path: z.string() }),
    execute,
  };
}

function createProfile() {
  return {
    intent: "answer" as const,
    riskLevel: "low" as const,
    requiresWorkspaceEvidence: true,
    requiresToolUse: true,
    workspaceAccess: {
      requested: true,
      action: "read" as const,
      explicit: true,
    },
    mentionedSymbols: [],
    constraints: [],
    summary: "workspace read",
  };
}
