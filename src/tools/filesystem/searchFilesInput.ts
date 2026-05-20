import { z } from "zod";

type SearchType = "name" | "content";

export interface SearchFilesInput {
  readonly pattern: string;
  readonly searchType: SearchType;
  readonly includeHidden?: boolean;
  readonly maxResults?: number;
  readonly fileTypes?: readonly string[];
  readonly excludePaths?: readonly string[];
}

export interface FileMatch {
  readonly path: string;
  readonly match?: string;
  readonly lineNumber?: number;
}

interface SearchInputAliases {
  readonly pattern?: unknown;
  readonly query?: unknown;
  readonly glob?: unknown;
  readonly path?: unknown;
  readonly filename?: unknown;
  readonly searchType?: unknown;
  readonly type?: unknown;
  readonly mode?: unknown;
}

export const SearchFilesSchema = z.preprocess(
  normalizeSearchInput,
  z.object({
    pattern: z
      .preprocess(normalizePattern, z.string().trim().min(1))
      .describe("File name pattern (regex or glob)"),
    searchType: z
      .preprocess(
        normalizeSearchType,
        z.enum(["name", "content"]).default("name"),
      )
      .describe("Search by file name or content"),
    includeHidden: z
      .preprocess(normalizeBoolean, z.boolean().optional())
      .describe("Include hidden files"),
    maxResults: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum results (default 100)"),
    fileTypes: z
      .preprocess(normalizeStringArray, z.array(z.string()).optional())
      .describe('File extensions to filter (e.g., ["ts", "js"])'),
    excludePaths: z
      .preprocess(normalizeStringArray, z.array(z.string()).optional())
      .describe("Paths to exclude"),
  }),
) as z.ZodSchema<SearchFilesInput>;

function normalizeSearchInput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const aliases = value as SearchInputAliases;
  return {
    ...value,
    pattern:
      aliases.pattern ??
      aliases.query ??
      aliases.glob ??
      aliases.path ??
      aliases.filename,
    searchType: aliases.searchType ?? aliases.type ?? aliases.mode,
  };
}

function normalizeSearchType(value: unknown): SearchType | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }

  const normalized = `${value}`.trim().toLowerCase();

  if (
    [
      "name",
      "file",
      "files",
      "filename",
      "filenames",
      "path",
      "paths",
      "glob",
    ].includes(normalized)
  ) {
    return "name";
  }

  if (
    ["content", "contents", "text", "body", "grep", "search"].includes(
      normalized,
    )
  ) {
    return "content";
  }

  return undefined;
}

function normalizePattern(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }

  return `${value}`;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "nao", "não"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string | number | boolean =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
      .map((item) => `${item}`.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
