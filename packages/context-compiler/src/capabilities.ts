import type { ContextCompilerCapabilities } from "./types";

const PACKAGE_VERSION = "0.0.0";

export function getContextCompilerCapabilities(): ContextCompilerCapabilities {
  return {
    packageName: "@korix/context-compiler",
    packageVersion: PACKAGE_VERSION,
    contextIrVersion: "0.1",
    features: [
      {
        name: "context-ir",
        status: "stable",
        detail: "Versioned ContextIR contract and provider formatter.",
      },
      {
        name: "native-ts-js-compiler",
        status: "experimental",
        detail:
          "napi-rs and tree-sitter TypeScript/JavaScript compiler backend.",
      },
      {
        name: "sqlite-cache",
        status: "experimental",
        detail: "Optional Node SQLite warm/cold cache snapshots.",
      },
      {
        name: "semantic-resolution",
        status: "experimental",
        detail:
          "Direct dependency resolution with simple tsconfig paths support.",
      },
      {
        name: "language-adapters",
        status: "experimental",
        detail:
          "Default adapter registry with tree-sitter TS/JS and lightweight text Rust/Java/Python support.",
      },
      {
        name: "summaries",
        status: "experimental",
        detail: "Deterministic source-hashed summaries for over-budget files.",
      },
      {
        name: "tool-output-optimizer",
        status: "experimental",
        detail: "Deterministic compression for long tool and terminal output.",
      },
      {
        name: "patch-optimizer",
        status: "experimental",
        detail: "Minimal KORIX_PATCH replacement-window optimization.",
      },
      {
        name: "embedding-fallback",
        status: "experimental",
        detail: "Optional ranking over externally supplied embedding vectors.",
      },
      {
        name: "quality-benchmarks",
        status: "experimental",
        detail:
          "Deterministic context evidence, outcome and value-per-token benchmarks.",
      },
      {
        name: "quality-telemetry",
        status: "experimental",
        detail:
          "In-memory collection of observed patch and task outcomes for context quality samples.",
      },
      {
        name: "worker-pools",
        status: "experimental",
        detail:
          "Package-level bounded async worker pool for future background indexing.",
      },
      {
        name: "background-indexing",
        status: "experimental",
        detail:
          "Package-level background indexing scheduler over compiler index operations.",
      },
      {
        name: "graph-snapshots",
        status: "experimental",
        detail:
          "Deterministic workspace graph snapshots derived from cache metadata.",
      },
      {
        name: "debug-snapshots",
        status: "experimental",
        detail: "Compact observability snapshots without source content.",
      },
    ],
  };
}
