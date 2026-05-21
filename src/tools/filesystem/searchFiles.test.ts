import { spawn } from "child_process";
import { describe, expect, it, vi } from "vitest";
import { createMockProcess } from "../../__tests__/factories/subprocess.factory";
import { createMockToolContext } from "../../__tests__/factories/toolContext.factory";
import { ToolRegistry } from "../../harness/toolRegistry";
import { SearchFilesTool } from "./searchFiles";

vi.mock("child_process", () => {
  const spawnMock = vi.fn();
  return {
    default: { spawn: spawnMock },
    spawn: spawnMock,
  };
});

describe("SearchFilesTool", () => {
  it("should normalize provider-friendly aliases before validation", () => {
    const result = SearchFilesTool.schema.safeParse({
      query: "*.ts",
      type: "filename",
      includeHidden: "false",
      maxResults: "5",
      fileTypes: "ts,tsx",
    });

    expect(result.success, result.error).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toMatchObject({
      pattern: "*.ts",
      searchType: "name",
      includeHidden: false,
      maxResults: 5,
      fileTypes: ["ts", "tsx"],
    });
  });

  it("should reject inputs without a searchable pattern", () => {
    const result = SearchFilesTool.schema.safeParse({ searchType: "filename" });

    expect(result.success).toBe(false);
  });

  it("should default missing searchType to name search and match glob patterns", async () => {
    const mockSpawn = vi.mocked(spawn);
    mockSpawn
      .mockReturnValueOnce(
        createMockProcess(0, "ripgrep 14.1.0\n") as unknown as ReturnType<
          typeof spawn
        >,
      )
      .mockReturnValueOnce(
        createMockProcess(
          0,
          "src/index.ts\nsrc/app.ts\nREADME.md\n",
        ) as unknown as ReturnType<typeof spawn>,
      );

    const registry = new ToolRegistry();
    registry.register(SearchFilesTool);

    const result = await registry.execute(
      "SearchFiles",
      { pattern: "*.ts" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual([
      { path: "src/index.ts" },
      { path: "src/app.ts" },
    ]);
  });
});
