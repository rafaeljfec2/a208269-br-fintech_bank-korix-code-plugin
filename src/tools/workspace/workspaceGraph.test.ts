import { describe, expect, it } from "vitest";
import { createContainer, setGlobalContainer } from "../../di/container";
import { TOKENS } from "../../di/tokens";
import type { ContextEngine } from "../../context/contextEngine";
import { WorkspaceGraphTool } from "./workspaceGraph";
import type { ToolContext } from "../../harness/toolRegistry";

function createToolContext(): ToolContext {
  return {
    execution: {
      mode: "agent",
      workspaceRoot: "/workspace",
      openFiles: [],
    },
    workspaceRoot: "/workspace",
  };
}

describe("WorkspaceGraphTool", () => {
  it("reads graph data from the DI-owned ContextEngine", async () => {
    const container = createContainer();
    const contextEngine: Pick<ContextEngine, "getWorkspaceGraph"> = {
      getWorkspaceGraph: () =>
        Promise.resolve({
          nodes: [
            {
              path: "/workspace/src/login.ts",
              imports: ["/workspace/src/session.ts"],
              importedBy: [],
              symbols: ["login"],
              distance: 0,
            },
          ],
          edges: [
            {
              from: "/workspace/src/login.ts",
              to: "/workspace/src/session.ts",
              type: "import",
            },
          ],
          totalFiles: 1,
          totalImports: 1,
        }),
    };

    container.bindValue(TOKENS.ContextEngine, contextEngine);
    setGlobalContainer(container);

    const result = await WorkspaceGraphTool.execute(
      {
        rootFile: "/workspace/src/login.ts",
        maxDepth: 1,
      },
      createToolContext(),
    );

    expect(result.success).toBe(true);
    expect(result.data?.nodes).toHaveLength(1);
    expect(result.data?.edges).toEqual([
      {
        from: "/workspace/src/login.ts",
        to: "/workspace/src/session.ts",
        type: "import",
      },
    ]);
  });

  it("omits node symbols when includeSymbols is false", async () => {
    const container = createContainer();
    const contextEngine: Pick<ContextEngine, "getWorkspaceGraph"> = {
      getWorkspaceGraph: () =>
        Promise.resolve({
          nodes: [
            {
              path: "/workspace/src/login.ts",
              imports: [],
              importedBy: [],
              symbols: ["login"],
              distance: 0,
            },
          ],
          edges: [],
          totalFiles: 1,
          totalImports: 0,
        }),
    };

    container.bindValue(TOKENS.ContextEngine, contextEngine);
    setGlobalContainer(container);

    const result = await WorkspaceGraphTool.execute(
      {
        includeSymbols: false,
      },
      createToolContext(),
    );

    expect(result.success).toBe(true);
    expect(result.data?.nodes[0]?.symbols).toEqual([]);
  });

  it("returns a failed tool result when graph construction fails", async () => {
    const container = createContainer();
    const contextEngine: Pick<ContextEngine, "getWorkspaceGraph"> = {
      getWorkspaceGraph: () => Promise.reject(new Error("graph unavailable")),
    };

    container.bindValue(TOKENS.ContextEngine, contextEngine);
    setGlobalContainer(container);

    const result = await WorkspaceGraphTool.execute({}, createToolContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("graph unavailable");
  });
});
