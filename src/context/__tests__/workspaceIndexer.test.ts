import * as vscode from "vscode";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceIndexer } from "../indexing/workspaceIndexer";
import type { WorkspaceIndex } from "../types";

interface IndexFileCapable {
  readonly indexFile: (
    uri: { readonly fsPath: string },
    notify?: boolean,
  ) => Promise<void>;
}

describe("WorkspaceIndexer graph accessors", () => {
  it("returns all imports and symbols by file without exposing mutable index state", () => {
    const indexer = new WorkspaceIndexer();
    const index: WorkspaceIndex = {
      files: new Map([
        [
          "/workspace/src/login.ts",
          {
            path: "/workspace/src/login.ts",
            size: 10,
            lastModified: 1,
          },
        ],
      ]),
      symbols: new Map([
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
      ]),
      imports: [
        {
          source: "/workspace/src/login.ts",
          target: "./session",
          isExternal: false,
        },
      ],
      lastIndexed: 1,
    };

    Object.defineProperty(indexer, "index", {
      value: index,
    });

    const imports = indexer.getAllImports();
    const symbolsByFile = indexer.getSymbolsByFile();

    imports.push({
      source: "/workspace/src/other.ts",
      target: "./other",
      isExternal: false,
    });

    expect(indexer.getAllImports()).toHaveLength(1);
    expect(symbolsByFile.get("/workspace/src/login.ts")?.[0]?.name).toBe(
      "login",
    );
  });

  it("replaces stale imports when the same file is indexed again", async () => {
    const indexer = new WorkspaceIndexer();
    const uri = vscode.Uri.file("/workspace/src/login.ts");
    const stat = vi
      .spyOn(vscode.workspace.fs, "stat")
      .mockResolvedValue({ size: 10, mtime: 1 });
    const openTextDocument = vi
      .spyOn(vscode.workspace, "openTextDocument")
      .mockResolvedValue({
        languageId: "typescript",
        getText: () => "const session = require('./session');",
      } as vscode.TextDocument);
    const executeCommand = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockResolvedValue([]);
    const indexFile = Reflect.get(
      indexer,
      "indexFile",
    ) as IndexFileCapable["indexFile"];

    await indexFile.call(indexer, uri);
    openTextDocument.mockResolvedValue({
      languageId: "typescript",
      getText: () => "const profile = require('./profile');",
    } as vscode.TextDocument);
    await indexFile.call(indexer, uri);

    expect(indexer.getImports(uri.fsPath).map((imp) => imp.target)).toEqual([
      "./profile",
    ]);

    stat.mockRestore();
    openTextDocument.mockRestore();
    executeCommand.mockRestore();
  });

  it("emits plain file input events only when indexing should notify", async () => {
    const indexedFiles: {
      readonly path: string;
      readonly content: string;
      readonly language?: string;
      readonly lastModified?: number;
    }[] = [];
    const indexer = new WorkspaceIndexer({
      onFileIndexed: (file) => {
        indexedFiles.push(file);
      },
    });
    const uri = vscode.Uri.file("/workspace/src/login.ts");
    const stat = vi
      .spyOn(vscode.workspace.fs, "stat")
      .mockResolvedValue({ size: 10, mtime: 123 });
    const openTextDocument = vi
      .spyOn(vscode.workspace, "openTextDocument")
      .mockResolvedValue({
        languageId: "typescript",
        getText: () => "export function login() { return true; }",
      } as vscode.TextDocument);
    const executeCommand = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockResolvedValue([]);
    const indexFile = Reflect.get(
      indexer,
      "indexFile",
    ) as IndexFileCapable["indexFile"];

    await indexFile.call(indexer, uri, false);
    await indexFile.call(indexer, uri);

    expect(indexedFiles).toEqual([
      {
        path: "/workspace/src/login.ts",
        content: "export function login() { return true; }",
        language: "typescript",
        lastModified: 123,
      },
    ]);

    stat.mockRestore();
    openTextDocument.mockRestore();
    executeCommand.mockRestore();
  });
});
