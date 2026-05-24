import { describe, expect, it } from "vitest";
import { formatContextIrForProvider } from "@korix/context-compiler";
import {
  buildWorkspaceGraphFromIndex,
  contextWindowToIr,
} from "../contextCompilerAdapter";
import type { ImportInfo, SymbolInfo } from "../types";

describe("context compiler adapter", () => {
  it("converts legacy context windows to ContextIR", () => {
    const contextIr = contextWindowToIr(
      {
        items: [
          {
            file: "/workspace/src/login.ts",
            content: "export function login() { return true; }",
            priority: 10,
            tokenCount: 10,
          },
        ],
        totalTokens: 10,
        budget: 100,
      },
      {
        userPrompt: "fix login",
        workspaceRoot: "/workspace",
        activeFile: "/workspace/src/login.ts",
        openFiles: ["/workspace/src/login.ts"],
        changedFiles: ["/workspace/src/login.ts"],
        mentionedSymbols: ["login"],
        userSelection: {
          file: "/workspace/src/login.ts",
          range: {
            start: {
              line: 3,
              character: 2,
            },
            end: {
              line: 5,
              character: 4,
            },
          },
        },
      },
    );

    expect(contextIr.version).toBe("0.1");
    expect(contextIr.task.userPrompt).toBe("fix login");
    expect(contextIr.task.activeFile).toBe("/workspace/src/login.ts");
    expect(contextIr.task.activeSelection).toEqual({
      startLine: 3,
      startColumn: 2,
      endLine: 5,
      endColumn: 4,
    });
    expect(contextIr.workspace.root).toBe("/workspace");
    expect(contextIr.workspace.openFiles).toEqual(["/workspace/src/login.ts"]);
    expect(contextIr.workspace.changedFiles).toEqual([
      "/workspace/src/login.ts",
    ]);
    expect(contextIr.context.files).toHaveLength(1);
    expect(contextIr.metrics.contextValuePerToken).toBeGreaterThan(0);
  });

  it("formats provider context without dumping debug score factors", () => {
    const contextIr = contextWindowToIr({
      items: [
        {
          file: "/workspace/src/login.ts",
          content: "export function login() { return true; }",
          priority: 10,
          tokenCount: 10,
        },
      ],
      totalTokens: 10,
      budget: 100,
    });

    const formatted = formatContextIrForProvider(contextIr);

    expect(formatted).toContain("# Workspace Context");
    expect(formatted).toContain("## Relevant Files");
    expect(formatted).toContain("export function login");
    expect(formatted).not.toContain("scoreFactors");
  });

  it("handles empty and zero-priority legacy context windows", () => {
    const emptyIr = contextWindowToIr({
      items: [],
      totalTokens: 0,
      budget: 100,
    });
    const zeroPriorityIr = contextWindowToIr({
      items: [
        {
          file: "/workspace/src/low.ts",
          content: "export const low = true;",
          priority: 0,
          tokenCount: 6,
        },
      ],
      totalTokens: 6,
      budget: 100,
    });

    expect(emptyIr.metrics.tokenSavingsPercent).toBe(0);
    expect(emptyIr.metrics.contextValuePerToken).toBe(0);
    expect(zeroPriorityIr.context.files[0]?.scoreFactors[0]).toMatchObject({
      value: 0,
      contribution: 0,
    });
  });

  it("builds workspace graph nodes and import edges from index data", () => {
    const files = [
      "/workspace/src/login.ts",
      "/workspace/src/session.ts",
      "/workspace/src/unrelated.ts",
    ];
    const imports: ImportInfo[] = [
      {
        source: "/workspace/src/login.ts",
        target: "./session",
        isExternal: false,
      },
    ];
    const symbols = new Map<string, readonly SymbolInfo[]>([
      [
        "/workspace/src/login.ts",
        [
          {
            name: "login",
            kind: "Function",
            location: {
              file: "/workspace/src/login.ts",
              line: 1,
              column: 1,
            },
          },
        ],
      ],
    ]);

    const graph = buildWorkspaceGraphFromIndex({
      files,
      imports,
      symbolsByFile: symbols,
      rootFile: "/workspace/src/login.ts",
      maxDepth: 1,
    });

    expect(graph.nodes.map((node) => node.path)).toEqual([
      "/workspace/src/login.ts",
      "/workspace/src/session.ts",
    ]);
    expect(graph.edges).toEqual([
      {
        from: "/workspace/src/login.ts",
        to: "/workspace/src/session.ts",
        type: "import",
      },
    ]);
    expect(graph.nodes[0]?.symbols).toEqual(["login"]);
  });

  it("builds a full graph when no root file is provided and ignores external imports", () => {
    const files = [
      "/workspace/src/login.ts",
      "/workspace/src/session.ts",
      "/workspace/src/unrelated.ts",
    ];
    const imports: ImportInfo[] = [
      {
        source: "/workspace/src/login.ts",
        target: "./session",
        isExternal: false,
      },
      {
        source: "/workspace/src/login.ts",
        target: "react",
        isExternal: true,
      },
    ];

    const graph = buildWorkspaceGraphFromIndex({
      files,
      imports,
      symbolsByFile: new Map(),
    });

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toEqual([
      {
        from: "/workspace/src/login.ts",
        to: "/workspace/src/session.ts",
        type: "import",
      },
    ]);
  });

  it("resolves non-relative import targets and skips unresolved internal imports", () => {
    const graph = buildWorkspaceGraphFromIndex({
      files: [
        "/workspace/src/login.ts",
        "/workspace/src/session.ts",
        "/workspace/src/cycle.ts",
      ],
      imports: [
        {
          source: "/workspace/src/login.ts",
          target: "/workspace/src/session.ts",
          isExternal: false,
        },
        {
          source: "/workspace/src/session.ts",
          target: "/workspace/src/cycle.ts",
          isExternal: false,
        },
        {
          source: "/workspace/src/cycle.ts",
          target: "/workspace/src/login.ts",
          isExternal: false,
        },
        {
          source: "/workspace/src/login.ts",
          target: "./missing",
          isExternal: false,
        },
      ],
      symbolsByFile: new Map(),
      rootFile: "/workspace/src/login.ts",
      maxDepth: 2,
    });

    expect(graph.nodes.map((node) => node.path)).toEqual([
      "/workspace/src/login.ts",
      "/workspace/src/session.ts",
      "/workspace/src/cycle.ts",
    ]);
    expect(graph.edges).toHaveLength(3);
  });
});
