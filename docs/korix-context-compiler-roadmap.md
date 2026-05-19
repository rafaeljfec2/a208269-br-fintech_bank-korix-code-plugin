# Korix Context Compiler Roadmap

## Executive Summary

O Korix Context Compiler e o nucleo estrutural planejado para transformar o workspace bruto em contexto compacto, relevante, explicavel e otimizado para LLMs.

Ele deve funcionar como um compilador incremental de contexto: coleta sinais do editor e do workspace, interpreta estrutura de codigo, monta um grafo semantico leve, seleciona simbolos relevantes, aplica passes de otimizacao e gera uma `ContextIR` que pode ser convertida em prompt para o provider.

O veredito tecnico e de produto e positivo: a tese e forte e diferencia o Korix de chatbots, wrappers de RAG e sistemas de prompt stuffing. O risco principal e tentar implementar a arquitetura final inteira antes de provar valor. Por isso, a primeira entrega deve ser uma v0.1 vertical e pequena:

- Rust/napi-rs no hot path.
- tree-sitter para TypeScript/JavaScript.
- indexacao incremental por arquivo.
- extracao de simbolos e imports.
- grafo unificado simples.
- retrieval heuristico deterministico.
- semantic chunks.
- `ContextIR` explicavel.
- token budget optimizer simples.
- integracao gradual com o `ContextEngine` atual.

Summaries, embeddings, SQLite, reference graph completo, multi-language profundo e patch optimizer avancado ficam registrados no roadmap, mas fora do MVP.

## Product Thesis

O problema central em coding agents nao e apenas a qualidade do modelo. E a qualidade do contexto entregue ao modelo.

Modelos fortes ainda falham quando recebem:

- arquivos gigantes sem priorizacao.
- dumps redundantes de workspace.
- logs extensos sem extracao do erro principal.
- historico irrelevante.
- simbolos errados ou desatualizados.
- contexto sem explicacao de por que foi incluido.

O Korix Context Compiler deve tornar o agente mais preciso, rapido e barato ao entregar contexto semanticamente organizado e token-efficient. O usuario final nao precisa ver o compilador trabalhando o tempo todo. Ele deve perceber valor em resultados:

- o agente edita o arquivo certo.
- o patch tem menos tentativas.
- o modelo alucina menos sobre o projeto.
- o contexto enviado e menor.
- a latencia nao vira gargalo.
- o sistema consegue explicar por que selecionou cada parte do contexto.

A narrativa de produto e:

> Korix nao joga o workspace inteiro no modelo. Korix compila o contexto que o modelo precisa.

## What It Is / What It Is Not

### What It Is

O Korix Context Compiler e:

- um compilador incremental de contexto para LLMs.
- um semantic workspace optimizer.
- um gerador de `ContextIR`.
- um token optimization engine.
- um dependency-aware context orchestrator.
- um retrieval engine deterministico e explicavel.
- uma base para observabilidade de contexto e benchmarks de qualidade.

### What It Is Not

O Korix Context Compiler nao e:

- um RAG generico.
- um chatbot.
- um vector database wrapper.
- um embeddings engine pesado.
- um search engine textual simples.
- um sistema de prompt stuffing.
- um mecanismo que envia arquivos inteiros por padrao.
- um substituto imediato para LSPs ou type checkers completos.

### Central Principle

O modelo nao deve receber texto bruto gigante. O modelo deve receber uma representacao contextual compilada:

- task e constraints.
- active file e active selection.
- simbolos relevantes.
- dependencias diretas.
- diagnostics relevantes.
- arquivos relacionados, de preferencia parciais.
- omitted context com reason.
- metricas de budget e selecao.

## Current Repository State

O repositorio atual e uma extensao VSCode TypeScript/Node com runtime agentico ja implementado. O contexto existente fica em `src/context` e possui uma fundacao embrionaria:

- `ContextEngine` orquestra indexacao, ranking e montagem de contexto.
- `WorkspaceIndexer` usa APIs do VSCode para listar arquivos e extrair `DocumentSymbol`.
- imports sao extraidos por regex.
- `HeuristicRanker` pontua arquivos por current file, selection, imports diretos, git diff, open tabs, simbolos mencionados e recencia.
- `ContextBuilder` abre documentos via VSCode e envia conteudo de arquivos inteiros ate preencher o budget.
- `TokenBudget` estima tokens por `text.length / 4`.
- `WorkspaceGraphTool` ainda e placeholder e nao expoe grafo real.

Isso e util como scaffold de produto, mas nao atende a tese do compiler:

- nao ha Rust.
- nao ha napi-rs.
- nao ha tree-sitter.
- nao ha semantic chunking real.
- nao ha `ContextIR` estruturada.
- nao ha graph layer real.
- nao ha reasons por item omitido.
- nao ha token optimization baseada em simbolos.
- o hot path ainda depende de TypeScript e VSCode APIs.

A implementacao deve substituir gradualmente esse engine por uma fachada TypeScript que delega o processamento pesado ao Rust, mantendo fallback para reduzir risco durante a migracao.

## Architecture Target

### High-Level Flow

```text
Workspace
  -> Parser Layer
  -> Symbol Index
  -> Workspace Graph
  -> Retrieval Layer
  -> Optimization Passes
  -> Context IR
  -> Token Budget Optimization
  -> Provider Prompt
  -> LLM
```

### Rust Responsibilities

Rust e obrigatorio para o hot path. Ele deve cuidar de:

- parsing.
- indexing.
- symbol extraction.
- graph traversal.
- scoring.
- relevance pruning.
- IR generation.
- token-aware packing.
- cache management.
- patch optimization em fases futuras.

Tecnologias obrigatorias:

- Rust.
- napi-rs.
- tree-sitter.
- tree-sitter-typescript para TS/TSX.
- tree-sitter-javascript para JS/JSX.

Nao usar no hot path:

- TypeScript para processamento pesado.
- regex parsing como fonte principal.
- subprocesso com JSON gigante.
- vector DB pesada no MVP.

### TypeScript Responsibilities

TypeScript deve ficar responsavel por:

- VSCode integration.
- extension lifecycle.
- provider communication.
- UI e webview.
- runtime coordination.
- coleta de sinais do editor.
- coleta de diagnostics, git state e open tabs.
- fallback temporario para o engine atual.
- formatacao final do prompt a partir da `ContextIR`.

TypeScript nao deve virar o motor de parsing, graph traversal ou ranking massivo.

### Suggested Native Layout

```text
native/
  context-compiler/
    Cargo.toml
    package.json
    build.rs
    src/
      lib.rs
      parser/
      index/
      graph/
      retrieval/
      ir/
      budget/
      metrics/
```

### Suggested TypeScript Layout

```text
src/context/
  contextEngine.ts
  nativeContextCompiler.ts
  contextIr.ts
  contextFormatter.ts
  fallback/
    legacyContextEngine.ts
```

The exact names can change during implementation, but the ownership boundary should not: Rust owns compiler work; TypeScript owns orchestration.

## v0.1 Vertical MVP

### Goal

Given a user prompt, current editor state and workspace signals, produce a compact, relevant and explainable `ContextIR` in under 100-300ms after warm cache for typical TypeScript/JavaScript workspaces.

### Must Have

The v0.1 implementation must include:

- Rust core exposed through napi-rs.
- TypeScript/JavaScript parsing with tree-sitter.
- workspace initialization from VSCode-provided candidate files.
- per-file reparse on create/change.
- per-file removal on delete.
- symbol extraction for functions, classes, interfaces, methods, imports and exports.
- a unified in-memory `WorkspaceGraph`.
- deterministic weighted retrieval.
- semantic chunks by symbol.
- fallback chunks only when symbol extraction is unavailable.
- `ContextIR` schema and TypeScript types.
- provider formatting from `ContextIR`.
- reasons for included and omitted context.
- latency and token metrics.
- fallback to current TypeScript engine if native module loading fails.

### Explicitly Out of v0.1

Do not implement these in v0.1:

- embeddings.
- vector DB.
- recursive summaries.
- rolling summaries.
- SQLite persistence.
- graph snapshots.
- reference graph completo.
- multi-language profundo.
- dirty-region parsing perfeito.
- tsserver semantic resolution.
- Rust/Python/Java/C++ language adapters.
- patch optimizer avancado.
- terminal output summarization.
- worker pool complexo.

These are roadmap items. Pulling them into v0.1 would increase risk before the core value is proven.

### v0.1 Success Criteria

The v0.1 is successful when:

- `ContextIR` includes the active file or active symbol for normal editor tasks.
- direct imports and mentioned symbols are selected with clear reasons.
- context formatting avoids full-file stuffing when semantic chunks exist.
- estimated tokens are reduced by at least 50% versus sending selected full files in internal fixtures.
- context build completes under 300ms after warm cache on small and medium TS workspaces.
- the VSCode extension still activates if the native module is unavailable.
- `WorkspaceGraphTool` returns real nodes and edges instead of placeholder data.

## Context IR Contract

`ContextIR` is the internal product of the compiler. It must be stable, testable and auditable.

Recommended TypeScript shape:

```typescript
export interface ContextIR {
  readonly version: "0.1";
  readonly task: ContextTask;
  readonly workspace: ContextWorkspace;
  readonly budget: ContextBudget;
  readonly context: CompiledContext;
  readonly omitted: readonly OmittedContextItem[];
  readonly metrics: ContextCompilerMetrics;
}

export interface ContextTask {
  readonly userPrompt: string;
  readonly activeFile?: string;
  readonly activeSelection?: SourceRange;
  readonly mentionedSymbols: readonly string[];
  readonly constraints: readonly string[];
}

export interface ContextWorkspace {
  readonly root: string;
  readonly languageHints: readonly string[];
  readonly openFiles: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface ContextBudget {
  readonly maxTokens: number;
  readonly estimatedTokens: number;
  readonly tokensBeforeOptimization: number;
}

export interface CompiledContext {
  readonly symbols: readonly ContextSymbol[];
  readonly files: readonly ContextFile[];
  readonly diagnostics: readonly ContextDiagnostic[];
}

export interface ContextSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly score: number;
  readonly reasons: readonly ContextReason[];
  readonly contentMode: "source" | "signature" | "summary";
  readonly content: string;
  readonly dependencies: readonly string[];
  readonly estimatedTokens: number;
}

export interface ContextFile {
  readonly path: string;
  readonly score: number;
  readonly includedMode: "full" | "partial" | "metadata";
  readonly reasons: readonly ContextReason[];
  readonly estimatedTokens: number;
}

export interface OmittedContextItem {
  readonly id: string;
  readonly kind: "file" | "symbol" | "diagnostic";
  readonly path?: string;
  readonly score: number;
  readonly reason: "low_score" | "budget_exceeded" | "duplicate" | "unsupported_language" | "external_dependency";
}
```

Reason codes are mandatory. Without reasons, context selection becomes hard to debug and impossible to tune safely.

### Example IR

```json
{
  "version": "0.1",
  "task": {
    "userPrompt": "Corrija o bug de login",
    "activeFile": "src/auth/login.ts",
    "mentionedSymbols": ["login"],
    "constraints": ["preserve public API", "minimal patch"]
  },
  "workspace": {
    "root": "/repo",
    "languageHints": ["typescript"],
    "openFiles": ["src/auth/login.ts"],
    "changedFiles": ["src/auth/login.ts"]
  },
  "budget": {
    "maxTokens": 24000,
    "estimatedTokens": 8200,
    "tokensBeforeOptimization": 31000
  },
  "context": {
    "symbols": [
      {
        "id": "sym_login",
        "name": "login",
        "kind": "function",
        "file": "src/auth/login.ts",
        "range": { "startLine": 35, "endLine": 88 },
        "score": 0.94,
        "reasons": ["active_file", "mentioned_symbol", "diagnostic_overlap"],
        "contentMode": "source",
        "content": "async function login(...) { ... }",
        "dependencies": ["sym_createSession"],
        "estimatedTokens": 900
      }
    ],
    "files": [
      {
        "path": "src/auth/session.ts",
        "score": 0.72,
        "includedMode": "partial",
        "reasons": ["import_distance_1"],
        "estimatedTokens": 650
      }
    ],
    "diagnostics": []
  },
  "omitted": [
    {
      "id": "file_legacy_auth",
      "kind": "file",
      "path": "src/auth/legacy.ts",
      "score": 0.12,
      "reason": "low_score"
    }
  ],
  "metrics": {
    "contextBuildLatencyMs": 84,
    "selectedFilesCount": 2,
    "selectedSymbolsCount": 3,
    "tokenSavingsPercent": 73,
    "cacheHitRatio": 0.86
  }
}
```

## Retrieval and Scoring Strategy

Retrieval v0.1 must be deterministic and explainable. Embeddings are not part of the initial path.

Recommended normalized score:

```text
score(item) =
  0.25 * active_editor_proximity
+ 0.20 * symbol_match
+ 0.15 * dependency_proximity
+ 0.15 * diagnostics_relevance
+ 0.10 * git_activity
+ 0.10 * open_tab_or_recency
+ 0.05 * path_similarity
```

Each factor must be normalized to `0.0..1.0`. Store factor contributions internally so explanations can show why an item was selected.

### Required Signals

Use these signals in v0.1:

- active file.
- active selection overlap.
- mentioned symbols from user prompt.
- open tabs.
- git changed files.
- diagnostics.
- direct imports.
- recently modified files.
- path similarity.

### Traversal Rules

- Prefer symbol-first retrieval.
- Use bounded traversal from active file and matched symbols.
- Include direct dependencies before indirect dependencies.
- Do not expand unboundedly across the workspace.
- Prune low-score items before budget packing.
- Deduplicate by stable symbol/file id.

### Chunking Rules

Use semantic chunks:

- function.
- class.
- interface.
- method.
- module-level exports.

Avoid:

- arbitrary character chunks.
- blind line splitting.
- full-file context when a relevant symbol chunk fits.

Full files are allowed only as fallback or when the file is small and no reliable symbol boundary exists.

## Performance and Observability

The compiler must never become the bottleneck. It should be cache-first, incremental and bounded.

### v0.1 Performance Targets

- extension activation must not block on a full native index.
- warm `buildContextIr` target: under 300ms.
- single file update target: under 100ms for normal source files.
- no repeated full workspace scans during agent loops.
- no blocking IO in the provider hot path.

### Required Metrics

Track at minimum:

- `context_build_latency_ms`
- `index_update_latency_ms`
- `parser_latency_ms`
- `graph_traversal_latency_ms`
- `retrieval_latency_ms`
- `selected_files_count`
- `selected_symbols_count`
- `estimated_tokens_before`
- `estimated_tokens_after`
- `token_savings_percent`
- `cache_hit_ratio`
- `dirty_files_count`

### Debug Capability

Add an explainability path named conceptually:

```text
Korix: Explain Context Selection
```

It should report:

- selected files.
- selected symbols.
- omitted items.
- score.
- reasons.
- estimated tokens.
- traversal distance.
- cache hits and misses.

This can start as a tool or command returning JSON/Markdown. A polished UI can come later.

## Risks and Mitigations

### Risk: Scope Explosion

The original architecture includes parser, graph, cache, summaries, memory, patch engine, workers, storage and embeddings. Building all at once delays visible product value.

Mitigation:

- ship v0.1 vertical.
- explicitly defer advanced systems.
- measure context quality before expanding.

### Risk: Stale Cache

Wrong cache invalidation can cause the model to reason from outdated context.

Mitigation:

- use content hashes.
- include parser version and strategy version in cache keys.
- aggressively invalidate changed file symbols and edges.
- keep fallback reparse by full file in v0.1.

### Risk: Tree-sitter Is Not Full Semantics

tree-sitter provides syntax structure, not complete type resolution.

Mitigation:

- describe the compiler as structural and progressively semantic.
- begin with TS/JS only.
- integrate tsserver/LSP later for deeper resolution.

### Risk: VSCode Extension Host Overhead

Native performance does not help if TypeScript orchestration blocks the extension host.

Mitigation:

- call native APIs asynchronously.
- avoid large JSON payloads where napi-rs can expose compact objects.
- use bounded file lists.
- do not index everything synchronously on activation.

### Risk: Context Compression Removes Needed Code

Optimizing only for low token count can hurt patch quality.

Mitigation:

- optimize for task success per token, not token count alone.
- never replace critical selected symbols with summaries when source fits.
- record omitted reasons.
- benchmark against baseline full-file context.

### Risk: Native Packaging Complexity

napi-rs adds build and packaging concerns to a TypeScript extension.

Mitigation:

- keep native package isolated.
- add a TypeScript fallback.
- copy `.node` artifacts explicitly during build/package.
- do not modify the protected CSS build pipeline.

## Roadmap

### v0.1 - Vertical Compiler MVP

- Rust/napi-rs core.
- tree-sitter TS/JS parser.
- per-file indexing.
- symbol and import extraction.
- in-memory workspace graph.
- deterministic retrieval.
- semantic chunks.
- `ContextIR`.
- provider formatting from IR.
- metrics and explanations.
- TypeScript fallback.

### v0.2 - Persistence and Cache Discipline

- SQLite warm/cold persistence.
- file metadata persistence.
- symbol index persistence.
- graph edge persistence.
- cache invalidation by content hash, parser version and strategy version.
- startup warm cache.

### v0.3 - Stronger Semantic Resolution

- reference graph improvements.
- optional tsserver/LSP integration.
- path alias resolution.
- export/import resolution for TypeScript projects.
- better monorepo boundaries.

### v0.4 - Summaries and Memory

- source-hashed summaries.
- rolling summaries.
- recursive summaries for distant context.
- strict rule: critical hot-path symbols use source when source fits.
- separate `source_context` and `summary_context`.

### v0.5 - Tool and Terminal Output Optimization

- terminal error extraction.
- stacktrace compression.
- relevance filtering for command output.
- diagnostic-aware terminal summaries.
- avoid sending thousands of log lines to the model.

### v0.6 - Patch Optimization

- separate Patch Engine from Context Compiler.
- Patience Diff primary.
- Myers Diff fallback.
- atomic writes.
- rollback snapshots.
- conflict detection.
- minimal patching.

### v0.7 - Embeddings Fallback

- optional embeddings for ambiguous semantic retrieval.
- no vector DB dependency in default local path.
- embeddings supplement deterministic retrieval; they do not replace it.

### v1.0 - Production Compiler Runtime

- multi-language adapters.
- worker pools with bounded queues.
- background indexing.
- graph snapshots.
- advanced observability.
- quality benchmarks.
- debug UI for power users.
- measured improvement in patch accept rate and task completion.

## Implementation Handoff

This section is the handoff for the engineer or agent implementing v0.1.

### Implementation Order

1. Add native package scaffold under `native/context-compiler`.
2. Configure Rust `cdylib` with napi-rs.
3. Add tree-sitter TypeScript/JavaScript dependencies.
4. Implement parser functions for TS/JS source files.
5. Implement Rust structs for files, symbols, imports, graph nodes and IR.
6. Expose napi functions:
   - `initialize`
   - `indexWorkspace`
   - `updateFile`
   - `removeFile`
   - `buildContextIr`
   - `explainSelection`
7. Add TypeScript types for `ContextIR` and request/response objects.
8. Add `NativeContextCompiler` wrapper with safe dynamic loading.
9. Update `ContextEngine` to call native compiler when available.
10. Preserve the current TypeScript context path as fallback.
11. Replace provider formatting to use semantic chunks from IR.
12. Update `WorkspaceGraphTool` to consume compiler graph output.
13. Add tests for Rust parsing/scoring and TypeScript fallback/formatting.
14. Update build/package scripts to include native artifacts.
15. Document native setup and troubleshooting.

### Compatibility Requirements

- Do not break `pnpm run compile`.
- Do not modify `src/webview/main.css`, `dist/webview.css` or esbuild CSS handling.
- Do not remove the current context engine until native fallback is proven.
- Do not introduce `any` in TypeScript.
- Use `??` for defaults.
- Keep runtime layer free of VSCode imports where existing architecture requires it.

### Suggested v0.1 Native API

```typescript
export interface BuildContextIrRequest {
  readonly userPrompt: string;
  readonly workspaceRoot: string;
  readonly activeFile?: string;
  readonly activeSelection?: SourceRange;
  readonly openFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly mentionedSymbols: readonly string[];
  readonly diagnostics: readonly ContextDiagnostic[];
  readonly maxTokens: number;
}

export interface ContextCompiler {
  initialize(root: string, options: ContextCompilerOptions): Promise<void>;
  indexWorkspace(files: readonly WorkspaceFileInput[]): Promise<IndexSummary>;
  updateFile(file: WorkspaceFileInput): Promise<IndexSummary>;
  removeFile(path: string): Promise<void>;
  buildContextIr(request: BuildContextIrRequest): Promise<ContextIR>;
  explainSelection(request: BuildContextIrRequest): Promise<ContextSelectionExplanation>;
}
```

### Prompt Formatting Rules

The provider context generated from `ContextIR` should include:

- task summary.
- relevant symbols with source chunks.
- relevant file metadata.
- diagnostics.
- constraints.
- context statistics.
- omitted context summary.

It should not include full files when symbol chunks are available and sufficient.

## Acceptance Criteria

The roadmap document is complete when:

- v0.1 is clearly separated from the final architecture.
- Rust, napi-rs and tree-sitter are marked as mandatory for the hot path.
- TypeScript responsibilities are limited to VSCode integration, orchestration, provider communication, UI and runtime coordination.
- summaries, embeddings, SQLite and patch optimization are clearly deferred to roadmap phases.
- the current repository state is accurately described.
- the gradual replacement strategy for the existing context engine is explicit.
- the `ContextIR` contract is concrete enough for implementation.
- the roadmap covers v0.1 through v1.0.
- another engineer can start implementation without reinterpreting product intent.
