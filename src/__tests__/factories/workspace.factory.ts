/**
 * Factory para criar mocks de workspace e arquivos para testes
 *
 * Uso:
 * ```typescript
 * const workspace = createMockWorkspace({
 *   "src/index.ts": "export const x = 1;",
 *   "package.json": "{}",
 * });
 *
 * const content = workspace.getFile("src/index.ts");
 * ```
 */

export interface MockWorkspace {
  readonly root: string;
  readonly files: Map<string, string>;
  getFile(path: string): string | null;
  hasFile(path: string): boolean;
  addFile(path: string, content: string): void;
  removeFile(path: string): void;
  listFiles(): string[];
}

/**
 * Cria um mock de workspace com arquivos
 *
 * @param files - Mapa de path → conteúdo
 * @param root - Workspace root path (default: "/test/workspace")
 * @returns MockWorkspace
 */
export function createMockWorkspace(
  files: Record<string, string> = {},
  root = "/test/workspace",
): MockWorkspace {
  const filesMap = new Map(Object.entries(files));

  return {
    root,
    files: filesMap,

    getFile(path: string): string | null {
      return filesMap.get(path) ?? null;
    },

    hasFile(path: string): boolean {
      return filesMap.has(path);
    },

    addFile(path: string, content: string): void {
      filesMap.set(path, content);
    },

    removeFile(path: string): void {
      filesMap.delete(path);
    },

    listFiles(): string[] {
      return Array.from(filesMap.keys());
    },
  };
}

/**
 * Cria um workspace mock com estrutura TypeScript típica
 *
 * @returns MockWorkspace com package.json, tsconfig.json, etc.
 */
export function createMockTypeScriptWorkspace(): MockWorkspace {
  return createMockWorkspace({
    "package.json": JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      dependencies: {
        typescript: "^5.0.0",
      },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true,
      },
    }),
    "src/index.ts": `export function hello() {
  return "Hello, World!";
}`,
    "src/utils.ts": `export function add(a: number, b: number) {
  return a + b;
}`,
    "src/__tests__/index.test.ts": `import { hello } from "../index";

describe("hello", () => {
  it("should return greeting", () => {
    expect(hello()).toBe("Hello, World!");
  });
});`,
  });
}

/**
 * Cria um workspace mock com estrutura monorepo
 *
 * @returns MockWorkspace com packages/
 */
export function createMockMonorepoWorkspace(): MockWorkspace {
  return createMockWorkspace({
    "package.json": JSON.stringify({
      name: "monorepo",
      private: true,
      workspaces: ["packages/*"],
    }),
    "packages/pkg-a/package.json": JSON.stringify({
      name: "@test/pkg-a",
      version: "1.0.0",
    }),
    "packages/pkg-a/src/index.ts": `export const A = "A";`,
    "packages/pkg-b/package.json": JSON.stringify({
      name: "@test/pkg-b",
      version: "1.0.0",
      dependencies: {
        "@test/pkg-a": "1.0.0",
      },
    }),
    "packages/pkg-b/src/index.ts": `import { A } from "@test/pkg-a";
export const B = A + "B";`,
  });
}

/**
 * Cria um workspace mock vazio (só com diretório root)
 *
 * @param root - Workspace root path
 * @returns MockWorkspace vazio
 */
export function createEmptyWorkspace(root = "/test/workspace"): MockWorkspace {
  return createMockWorkspace({}, root);
}

/**
 * Cria fixtures de arquivos para testes de git
 *
 * @returns Objeto com conteúdos de arquivos comuns em git
 */
export function createGitFixtures() {
  return {
    modified: `export const x = 1; // Modified
`,
    added: `export const newFile = true;
`,
    deleted: `// This file was deleted
`,
    unchanged: `export const unchanged = true;
`,
  };
}

/**
 * Cria fixtures de arquivos de configuração comuns
 *
 * @returns Objeto com arquivos de config comuns
 */
export function createConfigFixtures() {
  return {
    "package.json": JSON.stringify(
      {
        name: "test",
        version: "1.0.0",
        scripts: {
          test: "vitest",
          build: "tsc",
        },
      },
      null,
      2,
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: true,
        },
      },
      null,
      2,
    ),
    ".gitignore": `node_modules/
dist/
.env
`,
    "README.md": `# Test Project

This is a test project.
`,
  };
}
