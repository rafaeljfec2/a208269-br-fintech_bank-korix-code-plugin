import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../harness/toolRegistry";

const vscodeMocks = vi.hoisted(() => {
  const openTextDocument = vi.fn(
    async (uri: { readonly fsPath: string; readonly path: string }) => ({
      uri,
      languageId: "typescript",
    }),
  );
  const showTextDocument = vi.fn(async () => undefined);

  return {
    openTextDocument,
    showTextDocument,
  };
});

vi.mock("vscode", () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
  },
  workspace: {
    openTextDocument: vscodeMocks.openTextDocument,
    textDocuments: [],
  },
  window: {
    showTextDocument: vscodeMocks.showTextDocument,
    activeTextEditor: undefined,
  },
  languages: {
    getDiagnostics: () => [],
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
}));

import { OpenFileTool } from "./workspace";

describe("OpenFileTool", () => {
  const context: ToolContext = {
    execution: {
      mode: "agent",
      workspaceRoot: "/repo",
      openFiles: [],
    },
    workspaceRoot: "/repo",
  };

  beforeEach(() => {
    vscodeMocks.openTextDocument.mockClear();
    vscodeMocks.showTextDocument.mockClear();
  });

  it("should only be available in agent mode", () => {
    const tool = new OpenFileTool();

    expect(tool.allowedInMode("ask")).toBe(false);
    expect(tool.allowedInMode("plan")).toBe(false);
    expect(tool.allowedInMode("agent")).toBe(true);
  });

  it("should open a relative workspace file in VS Code", async () => {
    const tool = new OpenFileTool();

    const result = await tool.execute(
      { path: "src/example.ts", preview: true },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      path: "/repo/src/example.ts",
      languageId: "typescript",
    });
    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      fsPath: "/repo/src/example.ts",
      path: "/repo/src/example.ts",
    });
    expect(vscodeMocks.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: "typescript" }),
      { preview: true },
    );
  });
});
