import type {
  ContextLanguageAdapter,
  ContextLanguageAdapterResolution,
  ContextReason,
} from "./types";

const DEFAULT_LANGUAGE_ADAPTERS: readonly ContextLanguageAdapter[] = [
  {
    languageId: "typescript",
    extensions: [".ts", ".tsx"],
    status: "supported",
    parser: "tree-sitter",
    detail:
      "Native TypeScript/TSX adapter backed by tree-sitter when available.",
  },
  {
    languageId: "javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    status: "supported",
    parser: "tree-sitter",
    detail:
      "Native JavaScript/JSX adapter backed by tree-sitter when available.",
  },
  {
    languageId: "java",
    extensions: [".java"],
    status: "supported",
    parser: "text",
    detail: "Lightweight Java text adapter for class/interface/method symbols.",
  },
  {
    languageId: "rust",
    extensions: [".rs"],
    status: "supported",
    parser: "text",
    detail: "Lightweight Rust text adapter for type, impl and function symbols.",
  },
  {
    languageId: "python",
    extensions: [".py"],
    status: "supported",
    parser: "text",
    detail: "Lightweight Python text adapter for class/function symbols.",
  },
];

function normalizedExtension(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const fileName = path.slice(lastSlash + 1);
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot <= 0) {
    return "";
  }

  return fileName.slice(lastDot).toLowerCase();
}

export function getDefaultContextLanguageAdapters(): readonly ContextLanguageAdapter[] {
  return DEFAULT_LANGUAGE_ADAPTERS;
}

export function resolveContextLanguageAdapter(
  path: string,
  languageId?: string,
): ContextLanguageAdapterResolution {
  const normalizedLanguageId = languageId?.toLowerCase();
  const extension = normalizedExtension(path);
  const adapter =
    DEFAULT_LANGUAGE_ADAPTERS.find(
      (candidate) => candidate.languageId === normalizedLanguageId,
    ) ??
    DEFAULT_LANGUAGE_ADAPTERS.find((candidate) =>
      candidate.extensions.includes(extension),
    );
  const reasons: ContextReason[] = [];

  if (adapter === undefined) {
    reasons.push({ code: "language_adapter_not_found" });
    return { reasons };
  }

  reasons.push({
    code:
      adapter.status === "supported"
        ? "language_adapter_supported"
        : "language_adapter_planned",
    detail: adapter.languageId,
  });

  return {
    adapter,
    reasons,
  };
}
