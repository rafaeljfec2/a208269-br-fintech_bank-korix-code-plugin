import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_CONTEXT_COMPILER_TARGETS } from "@korix/context-compiler";

function readNativeWorkflow(): string {
  return readFileSync(
    resolve(".github/workflows/context-compiler-native.yml"),
    "utf8",
  );
}

function readEsbuildConfig(): string {
  return readFileSync(resolve("esbuild.config.js"), "utf8");
}

function validateNativeManifest(
  manifest: unknown,
  options: { readonly cwd?: string } = {},
): void {
  const tempDir = mkdtempSync(resolve(tmpdir(), "korix-native-manifest-"));
  const manifestPath = resolve(tempDir, "manifest.json");

  try {
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    execFileSync(
      "node",
      [resolve("scripts/validate-native-manifest.mjs"), manifestPath],
      {
        cwd: options.cwd,
        stdio: "pipe",
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function extractArtifactTargets(workflow: string): readonly string[] {
  return Array.from(workflow.matchAll(/artifact:\s*([a-z0-9-]+)/g)).map(
    (match) => {
      const target = match[1];
      if (target === undefined) {
        throw new Error("Expected workflow artifact target capture");
      }
      return target;
    },
  );
}

function extractBundledNativeTargets(esbuildConfig: string): readonly string[] {
  const targetsMatch = esbuildConfig.match(
    /const nativeContextCompilerTargets = \[(?<targets>[\s\S]*?)\];/,
  );
  if (targetsMatch?.groups?.targets === undefined) {
    throw new Error("Expected esbuild native context compiler targets");
  }

  return Array.from(targetsMatch.groups.targets.matchAll(/'([^']+)'/g)).map(
    (match) => {
      const target = match[1];
      if (target === undefined) {
        throw new Error("Expected esbuild native target capture");
      }
      return target;
    },
  );
}

describe("context compiler native workflow", () => {
  it("builds every supported native target", () => {
    const workflow = readNativeWorkflow();

    expect(extractArtifactTargets(workflow).sort()).toEqual(
      [...NATIVE_CONTEXT_COMPILER_TARGETS].sort(),
    );
  });

  it("builds native artifacts and assembles Darwin universal output", () => {
    const workflow = readNativeWorkflow();

    expect(workflow).toContain("napi build");
    expect(workflow).toContain("napi universalize");
    expect(workflow).toContain("index.darwin-universal.node");
  });

  it("runs when native manifest validation changes", () => {
    const workflow = readNativeWorkflow();

    expect(workflow).toMatch(
      /pull_request:[\s\S]*paths:[\s\S]*scripts\/validate-native-manifest\.mjs[\s\S]*push:/,
    );
  });

  it("packages a VSIX with downloaded native artifacts", () => {
    const workflow = readNativeWorkflow();
    const esbuildConfig = readEsbuildConfig();

    expect(workflow).toContain("package-vsix:");
    expect(workflow).toContain("pattern: context-compiler-*");
    expect(workflow).toContain("merge-multiple: true");
    expect(workflow).toContain("pnpm run compile");
    expect(workflow).toContain("pnpm exec vsce package --no-dependencies");
    expect(workflow).toContain("context-compiler-native-manifest.json");
    expect(workflow).toContain("korix-code-vsix");
    expect(workflow).toContain("scripts/validate-native-manifest.mjs");
    expect(esbuildConfig).toContain("copiedArtifactBytes");
    expect(esbuildConfig).toContain("totalArtifactBytes");
  });

  it("bundles the same native targets supported by the package", () => {
    const esbuildConfig = readEsbuildConfig();

    expect(extractBundledNativeTargets(esbuildConfig).sort()).toEqual(
      [...NATIVE_CONTEXT_COMPILER_TARGETS].sort(),
    );
  });

  it("validates complete native manifest diagnostics", () => {
    validateNativeManifest({
      copiedArtifacts: [
        "index.linux-x64-gnu.node",
        "index.win32-x64-msvc.node",
      ],
      copiedArtifactBytes: [
        {
          name: "index.linux-x64-gnu.node",
          bytes: 1024,
        },
        {
          name: "index.win32-x64-msvc.node",
          bytes: 2048,
        },
      ],
      supportedTargets: ["linux-x64-gnu", "win32-x64-msvc"],
      totalArtifactBytes: 3072,
    });
  });

  it("validates native manifests outside the repository working directory", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "korix-native-manifest-cwd-"));

    try {
      validateNativeManifest(
        {
          copiedArtifacts: ["index.linux-x64-gnu.node"],
          copiedArtifactBytes: [
            {
              name: "index.linux-x64-gnu.node",
              bytes: 1024,
            },
          ],
          supportedTargets: ["linux-x64-gnu"],
          totalArtifactBytes: 1024,
        },
        { cwd: tempDir },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects incomplete native manifest diagnostics", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: ["index.linux-x64-gnu.node"],
        copiedArtifactBytes: [],
        supportedTargets: ["linux-x64-gnu"],
        totalArtifactBytes: 1024,
      }),
    ).toThrow("Native artifact byte diagnostics are incomplete");
  });

  it("rejects unsupported native manifest artifacts", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: ["index.linux-arm64-gnu.node"],
        copiedArtifactBytes: [
          {
            name: "index.linux-arm64-gnu.node",
            bytes: 1024,
          },
        ],
        supportedTargets: ["linux-x64-gnu"],
        totalArtifactBytes: 1024,
      }),
    ).toThrow("Native artifact is not supported");
  });

  it("rejects duplicate native manifest artifacts", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: [
          "index.linux-x64-gnu.node",
          "index.linux-x64-gnu.node",
        ],
        copiedArtifactBytes: [
          {
            name: "index.linux-x64-gnu.node",
            bytes: 1024,
          },
          {
            name: "index.win32-x64-msvc.node",
            bytes: 2048,
          },
        ],
        supportedTargets: ["linux-x64-gnu", "win32-x64-msvc"],
        totalArtifactBytes: 3072,
      }),
    ).toThrow("Native artifact list contains duplicates");
  });

  it("rejects duplicate native manifest byte diagnostics", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: [
          "index.linux-x64-gnu.node",
          "index.win32-x64-msvc.node",
        ],
        copiedArtifactBytes: [
          {
            name: "index.linux-x64-gnu.node",
            bytes: 1024,
          },
          {
            name: "index.linux-x64-gnu.node",
            bytes: 2048,
          },
        ],
        supportedTargets: ["linux-x64-gnu", "win32-x64-msvc"],
        totalArtifactBytes: 3072,
      }),
    ).toThrow("Native artifact byte diagnostics contain duplicates");
  });

  it("rejects unknown native manifest targets", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: ["index.not-a-real-target.node"],
        copiedArtifactBytes: [
          {
            name: "index.not-a-real-target.node",
            bytes: 1024,
          },
        ],
        supportedTargets: ["not-a-real-target"],
        totalArtifactBytes: 1024,
      }),
    ).toThrow("Native supported target is unknown");
  });

  it("rejects mismatched native manifest byte totals", () => {
    expect(() =>
      validateNativeManifest({
        copiedArtifacts: ["index.linux-x64-gnu.node"],
        copiedArtifactBytes: [
          {
            name: "index.linux-x64-gnu.node",
            bytes: 1024,
          },
        ],
        supportedTargets: ["linux-x64-gnu"],
        totalArtifactBytes: 2048,
      }),
    ).toThrow("Native artifact total byte count does not match copied artifacts");
  });
});
