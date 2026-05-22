import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../../__tests__/factories/toolContext.factory";
import { globalToolRegistry } from "../../harness/toolRegistry";
import { GlobTool } from "./glob";
import { registerAllTools } from "../index";

vi.mock("../../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let workspaceRoot: string;

async function createFile(relativePath: string): Promise<void> {
  const absolutePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, "content", "utf-8");
}

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("GlobTool", () => {
  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "korix-glob-"));
    resetGlobalRegistry();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("should find TypeScript files recursively", async () => {
    await createFile("src/index.ts");
    await createFile("src/app.tsx");
    await createFile("README.md");
    await createFile("test/unit/tool.test.ts");

    const result = await GlobTool.execute(
      { pattern: "**/*.ts" },
      createMockToolContext({ workspaceRoot }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual(["src/index.ts", "test/unit/tool.test.ts"]);
  });

  it("should support brace extension patterns", async () => {
    await createFile("src/index.ts");
    await createFile("src/app.tsx");
    await createFile("src/app.jsx");
    await createFile("docs/example.ts");

    const result = await GlobTool.execute(
      { pattern: "src/**/*.{ts,tsx}" },
      createMockToolContext({ workspaceRoot }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual(["src/app.tsx", "src/index.ts"]);
  });

  it("should apply default ignores for node_modules and .git", async () => {
    await createFile("src/index.ts");
    await createFile("node_modules/pkg/index.ts");
    await createFile(".git/hooks/pre-commit.ts");

    const result = await GlobTool.execute(
      { pattern: "**/*.ts" },
      createMockToolContext({ workspaceRoot }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual(["src/index.ts"]);
  });

  it("should respect caller ignore patterns", async () => {
    await createFile("src/index.ts");
    await createFile("src/generated/types.ts");
    await createFile("tests/index.test.ts");

    const result = await GlobTool.execute(
      { pattern: "**/*.ts", ignore: ["src/generated/**", "tests/**"] },
      createMockToolContext({ workspaceRoot }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual(["src/index.ts"]);
  });

  it("should limit results to maxResults", async () => {
    await createFile("a.ts");
    await createFile("b.ts");
    await createFile("c.ts");

    const result = await GlobTool.execute(
      { pattern: "**/*.ts", maxResults: 2 },
      createMockToolContext({ workspaceRoot }),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it("should be registered while SearchFiles remains available", () => {
    registerAllTools();

    expect(globalToolRegistry.has("Glob")).toBe(true);
    expect(globalToolRegistry.has("SearchFiles")).toBe(true);
  });
});
