import type {
  ContextReason,
  PatchOptimizationRequest,
  PatchOptimizationResult,
} from "./types";

function splitLines(content: string): readonly string[] {
  return content.length === 0 ? [] : content.split("\n");
}

function commonPrefixLength(
  left: readonly string[],
  right: readonly string[],
): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  left: readonly string[],
  right: readonly string[],
  prefixLength: number,
): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let index = 0;

  while (
    index < limit &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }

  return index;
}

function formatKorixPatch(path: string, search: string, replace: string): string {
  return [
    `<KORIX_PATCH file="${path}">`,
    "<SEARCH>",
    search,
    "</SEARCH>",
    "<REPLACE>",
    replace,
    "</REPLACE>",
    "</KORIX_PATCH>",
  ].join("\n");
}

interface PatchWindow {
  readonly searchStart: number;
  readonly searchEnd: number;
  readonly replaceStart: number;
  readonly replaceEnd: number;
}

function patchWindow(
  originalLines: readonly string[],
  modifiedLines: readonly string[],
  prefixLength: number,
  suffixLength: number,
  contextLines: number,
): PatchWindow | undefined {
  const changedOriginalEnd = originalLines.length - suffixLength;
  const changedModifiedEnd = modifiedLines.length - suffixLength;
  let searchStart = Math.max(0, prefixLength - contextLines);
  let searchEnd = Math.min(
    changedOriginalEnd + contextLines,
    originalLines.length,
  );
  let replaceStart = Math.max(0, prefixLength - contextLines);
  let replaceEnd = Math.min(
    changedModifiedEnd + contextLines,
    modifiedLines.length,
  );

  if (searchStart < searchEnd) {
    return { searchStart, searchEnd, replaceStart, replaceEnd };
  }

  if (originalLines.length === 0) {
    return undefined;
  }

  if (prefixLength > 0) {
    searchStart = prefixLength - 1;
    searchEnd = prefixLength;
    replaceStart = prefixLength - 1;
    replaceEnd = changedModifiedEnd;
  } else {
    searchStart = changedOriginalEnd;
    searchEnd = Math.min(originalLines.length, changedOriginalEnd + 1);
    replaceStart = prefixLength;
    replaceEnd = Math.min(modifiedLines.length, changedModifiedEnd + 1);
  }

  return { searchStart, searchEnd, replaceStart, replaceEnd };
}

export function optimizeReplacementPatch(
  request: PatchOptimizationRequest,
): PatchOptimizationResult {
  const originalCharacters = request.originalContent.length;
  if (request.originalContent === request.modifiedContent) {
    return {
      changed: false,
      originalCharacters,
      patchCharacters: 0,
      reasons: [],
    };
  }

  const originalLines = splitLines(request.originalContent);
  const modifiedLines = splitLines(request.modifiedContent);
  const prefixLength = commonPrefixLength(originalLines, modifiedLines);
  const suffixLength = commonSuffixLength(
    originalLines,
    modifiedLines,
    prefixLength,
  );
  const contextLines = Math.max(0, request.contextLines ?? 2);
  const window = patchWindow(
    originalLines,
    modifiedLines,
    prefixLength,
    suffixLength,
    contextLines,
  );
  if (window === undefined) {
    return {
      changed: true,
      originalCharacters,
      patchCharacters: 0,
      reasons: [{ code: "patch_anchor_unavailable" }],
    };
  }

  const search = originalLines.slice(window.searchStart, window.searchEnd).join("\n");
  const replace = modifiedLines
    .slice(window.replaceStart, window.replaceEnd)
    .join("\n");
  const patch = formatKorixPatch(request.path, search, replace);
  const reasons: ContextReason[] = [
    { code: "minimal_replacement_window" },
    { code: "context_lines_retained", detail: String(contextLines) },
  ];

  return {
    changed: true,
    patch,
    search,
    replace,
    originalCharacters,
    patchCharacters: patch.length,
    reasons,
  };
}
