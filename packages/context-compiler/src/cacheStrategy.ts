import type {
  ContextCacheFileMetadata,
  ContextCacheGraphEdge,
  ContextCacheSnapshot,
  ContextCacheSummary,
  ContextCacheStrategy,
  ContextSummary,
  WorkspaceFileInput,
} from "./types";

export const CONTEXT_COMPILER_CACHE_STRATEGY: ContextCacheStrategy = {
  contentHashAlgorithm: "fnv1a32-utf16",
  parserVersion: "fallback-text-v1",
  strategyVersion: "fallback-score-v1",
};

export function getContextCompilerCacheStrategy(): ContextCacheStrategy {
  return CONTEXT_COMPILER_CACHE_STRATEGY;
}

export function hashWorkspaceFileContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createContextCacheFileMetadata(
  file: WorkspaceFileInput,
): ContextCacheFileMetadata {
  return {
    path: file.path,
    contentHash: hashWorkspaceFileContent(file.content),
    parserVersion: CONTEXT_COMPILER_CACHE_STRATEGY.parserVersion,
    strategyVersion: CONTEXT_COMPILER_CACHE_STRATEGY.strategyVersion,
    language: file.language,
    lastModified: file.lastModified,
    estimatedTokens: Math.ceil(file.content.length / 4),
  };
}

function removeLineComment(line: string): string {
  let quote: "'" | '"' | "`" | undefined;

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const previous = line[index - 1];

    if (quote !== undefined) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "/" && next === "/") {
      return line.slice(0, index);
    }
  }

  return line;
}

function stripCommentsPreservingStrings(content: string): string {
  let result = "";
  let quote: "'" | '"' | "`" | undefined;
  let insideBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    const previous = content[index - 1];

    if (insideBlockComment) {
      if (char === "*" && next === "/") {
        result += " ";
        index += 1;
        insideBlockComment = false;
        continue;
      }
      result += char === "\n" ? "\n" : " ";
      continue;
    }

    if (quote !== undefined) {
      result += char;
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      result += char;
      continue;
    }

    if (char === "/" && next === "*") {
      result += " ";
      index += 1;
      insideBlockComment = true;
      continue;
    }

    result += char;
  }

  return result;
}

function sourceLinesWithoutComments(content: string): readonly string[] {
  const lines: string[] = [];

  for (const line of stripCommentsPreservingStrings(content).split(/\r?\n/)) {
    const uncommented = removeLineComment(line).trim();
    if (uncommented.length > 0) {
      lines.push(uncommented);
    }
  }

  return lines;
}

export function extractImportSpecifiers(content: string): readonly string[] {
  const specifiers = new Set<string>();
  const importExportPatterns = [
    /^import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/,
    /^export\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/,
  ];
  const requirePatterns = [
    /^(?:const|let|var)\s+[\w${}\s,[\]]+\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/,
    /^require\s*\(\s*["']([^"']+)["']\s*\)/,
  ];
  const lines = sourceLinesWithoutComments(content);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const isImportExport =
      line.startsWith("import ") || line.startsWith("export ");
    const statementParts = [line];

    if (isImportExport) {
      while (!statementParts.join(" ").includes(";") && index + 1 < lines.length) {
        index += 1;
        statementParts.push(lines[index] ?? "");
        if (/["'][^"']+["']/.test(statementParts.join(" "))) {
          break;
        }
      }
    }

    const statement = statementParts.join(" ");
    const patterns = isImportExport ? importExportPatterns : requirePatterns;
    for (const pattern of patterns) {
      const specifier = pattern.exec(statement)?.[1];
      if (specifier !== undefined) {
        specifiers.add(specifier);
        break;
      }
    }
  }

  return Array.from(specifiers).sort();
}

export function createContextCacheGraphEdges(
  files: readonly WorkspaceFileInput[],
): readonly ContextCacheGraphEdge[] {
  return files.flatMap((file) =>
    extractImportSpecifiers(file.content).map((specifier) => ({
      from: file.path,
      to: specifier,
      type: "import" as const,
    })),
  );
}

export function createContextCacheSummary(
  summary: ContextSummary,
): ContextCacheSummary {
  return {
    id: summary.id,
    kind: summary.kind,
    path: summary.path,
    sourceHash: summary.sourceHash,
    summary: summary.summary,
    estimatedTokens: summary.estimatedTokens,
    reasonCodes: summary.reasons.map((reason) => reason.code),
  };
}

export function createContextCacheSummaries(
  summaries: readonly ContextSummary[],
): readonly ContextCacheSummary[] {
  return summaries.map(createContextCacheSummary).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function createContextCacheSnapshot(
  files: readonly WorkspaceFileInput[],
): ContextCacheSnapshot {
  return {
    version: "0.1",
    strategy: CONTEXT_COMPILER_CACHE_STRATEGY,
    files: files.map(createContextCacheFileMetadata),
    graphEdges: createContextCacheGraphEdges(files),
  };
}
