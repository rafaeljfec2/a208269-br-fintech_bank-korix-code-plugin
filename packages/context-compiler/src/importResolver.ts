import path from "node:path";
import { extractImportSpecifiers } from "./cacheStrategy";
import type { WorkspaceFileInput } from "./types";

interface TsConfigResolution {
  readonly configDirectory: string;
  readonly baseUrl?: string;
  readonly paths: readonly TsConfigPathMapping[];
}

interface TsConfigPathMapping {
  readonly pattern: string;
  readonly targets: readonly string[];
}

function normalizePath(value: string): string {
  return path.normalize(value).replaceAll("\\", "/");
}

function joinPath(base: string, target: string): string {
  if (target.startsWith("/")) {
    return normalizePath(target);
  }

  const parts: string[] = [];
  const combined = base.length > 0 ? `${base}/${target}` : target;

  for (const part of normalizePath(combined).split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return `${base.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function candidatePaths(basePath: string): readonly string[] {
  return [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
  ].map(normalizePath);
}

function matchExistingFile(
  basePath: string,
  filesByPath: ReadonlyMap<string, WorkspaceFileInput>,
): string | undefined {
  for (const candidate of candidatePaths(basePath)) {
    const file = filesByPath.get(candidate);
    if (file !== undefined) {
      return file.path;
    }
  }

  return undefined;
}

function parseTsConfig(file: WorkspaceFileInput): TsConfigResolution | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    return undefined;
  }

  if (!isObject(parsed) || !isObject(parsed.compilerOptions)) {
    return undefined;
  }

  const compilerOptions = parsed.compilerOptions;
  const baseUrl =
    typeof compilerOptions.baseUrl === "string"
      ? compilerOptions.baseUrl
      : undefined;
  const paths = isObject(compilerOptions.paths)
    ? Object.entries(compilerOptions.paths).flatMap(([pattern, value]) => {
        if (!Array.isArray(value)) {
          return [];
        }

        const targets = value.filter(
          (target): target is string => typeof target === "string",
        );
        return targets.length > 0 ? [{ pattern, targets }] : [];
      })
    : [];

  if (baseUrl === undefined && paths.length === 0) {
    return undefined;
  }

  return {
    configDirectory: normalizePath(path.dirname(file.path)),
    baseUrl,
    paths,
  };
}

function loadTsConfig(files: readonly WorkspaceFileInput[]): TsConfigResolution | undefined {
  const tsConfigFile = files.find((file) => {
    const normalized = normalizePath(file.path);
    return normalized === "tsconfig.json" || normalized.endsWith("/tsconfig.json");
  });

  return tsConfigFile === undefined ? undefined : parseTsConfig(tsConfigFile);
}

function resolvePathAlias(
  specifier: string,
  filesByPath: ReadonlyMap<string, WorkspaceFileInput>,
  tsConfig: TsConfigResolution | undefined,
): string | undefined {
  if (tsConfig === undefined) {
    return undefined;
  }

  const baseDirectory = normalizePath(
    joinPath(tsConfig.configDirectory, tsConfig.baseUrl ?? "."),
  );

  for (const mapping of tsConfig.paths) {
    const wildcardIndex = mapping.pattern.indexOf("*");
    if (wildcardIndex < 0 && specifier !== mapping.pattern) {
      continue;
    }

    const prefix =
      wildcardIndex >= 0 ? mapping.pattern.slice(0, wildcardIndex) : mapping.pattern;
    const suffix =
      wildcardIndex >= 0 ? mapping.pattern.slice(wildcardIndex + 1) : "";

    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }

    const wildcard =
      wildcardIndex >= 0
        ? specifier.slice(prefix.length, specifier.length - suffix.length)
        : "";

    for (const target of mapping.targets) {
      const targetPath = target.replace("*", wildcard);
      const resolved = matchExistingFile(
        joinPath(baseDirectory, targetPath),
        filesByPath,
      );
      if (resolved !== undefined) {
        return resolved;
      }
    }
  }

  if (tsConfig.baseUrl !== undefined) {
    return matchExistingFile(joinPath(baseDirectory, specifier), filesByPath);
  }

  return undefined;
}

function resolveImportSpecifier(
  sourcePath: string,
  specifier: string,
  filesByPath: ReadonlyMap<string, WorkspaceFileInput>,
  tsConfig: TsConfigResolution | undefined,
): string | undefined {
  if (specifier.startsWith(".")) {
    return matchExistingFile(
      joinPath(path.dirname(sourcePath), specifier),
      filesByPath,
    );
  }

  if (specifier.startsWith("/")) {
    return matchExistingFile(specifier, filesByPath);
  }

  if (isExternalSpecifier(specifier)) {
    return resolvePathAlias(specifier, filesByPath, tsConfig);
  }

  return undefined;
}

export function directDependencyTargets(
  sourcePath: string | undefined,
  files: readonly WorkspaceFileInput[],
): ReadonlySet<string> {
  if (sourcePath === undefined) {
    return new Set();
  }

  const filesByPath = new Map(
    files.map((file) => [normalizePath(file.path), file] as const),
  );
  const source = filesByPath.get(normalizePath(sourcePath));
  if (source === undefined) {
    return new Set();
  }

  const tsConfig = loadTsConfig(files);
  const targets = new Set<string>();
  for (const specifier of extractImportSpecifiers(source.content)) {
    const resolved = resolveImportSpecifier(
      normalizePath(source.path),
      specifier,
      filesByPath,
      tsConfig,
    );
    if (resolved !== undefined) {
      targets.add(resolved);
    }
  }

  return targets;
}
