# Korix Context Compiler Roadmap

## Executive Summary

O Korix Context Compiler e o nucleo estrutural planejado para transformar o workspace bruto em contexto compacto, relevante, explicavel e otimizado para LLMs.

Ele deve funcionar como um compilador incremental de contexto: coleta sinais do editor e do workspace, interpreta estrutura de codigo, monta um grafo semantico leve, seleciona simbolos relevantes, aplica passes de otimizacao e gera uma `ContextIR` que pode ser convertida em prompt para o provider.

O veredito tecnico e de produto e positivo: a tese e forte e diferencia o Korix de chatbots, wrappers de RAG e sistemas de prompt stuffing. O repositorio atual ja tem um scaffold util de contexto, mas ele ainda funciona mais como um context packer baseado em arquivos inteiros do que como um compiler semantico.

O Context Compiler deve nascer como um package separado, consumido pela extensao por uma camada adaptadora. Ele nao deve ficar acoplado a `src/context` nem importar VSCode. A extensao coleta sinais do editor; o package compila workspace, grafo, retrieval, budget e `ContextIR`.

Sua funcao principal e maximizar **melhor contexto por token**. A meta nao e apenas reduzir tokens, mas aumentar a densidade de contexto util entregue ao modelo: mais evidencia relevante, menos ruido, menos arquivos inteiros desnecessarios e maior chance de patch correto por token enviado.

O risco principal e tentar implementar a arquitetura final inteira antes de provar valor. Por isso, a primeira etapa deve ser uma v0.0 de contrato e integracao, seguida por uma v0.1 vertical e pequena. A ordem de implementacao deve provar o package, a `ContextIR` e a integracao antes de expandir o motor nativo:

- contrato `ContextIR` e formatter estaveis.
- package `@korix/context-compiler` separado.
- integracao gradual com o `ContextEngine` atual.
- fallback TypeScript preservado.
- Rust/napi-rs no hot path.
- tree-sitter para TypeScript/JavaScript.
- indexacao incremental por arquivo.
- extracao de simbolos e imports.
- grafo unificado simples.
- retrieval heuristico deterministico.
- semantic chunks.
- token budget optimizer simples.

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
- cada token enviado carrega mais evidencia util.
- o contexto enviado e menor quando isso nao sacrifica qualidade.
- a latencia nao vira gargalo.
- o sistema consegue explicar por que selecionou cada parte do contexto.

A narrativa de produto e:

> Korix nao joga o workspace inteiro no modelo. Korix compila o contexto que o modelo precisa.

North-star metric:

```text
context_value_per_token = task_success_signal / provider_prompt_tokens
```

Na pratica, v0.1 deve usar proxies mensuraveis: reducao de tokens versus baseline full-file, presenca do simbolo correto, imports diretos relevantes, diagnostics relevantes e menor necessidade de tentativas adicionais.

## What It Is / What It Is Not

### What It Is

O Korix Context Compiler e:

- um compilador incremental de contexto para LLMs.
- um package separado, reutilizavel e testavel fora da extensao VSCode.
- um semantic workspace optimizer.
- um gerador de `ContextIR`.
- um token optimization engine.
- um mecanismo de melhor contexto por token.
- um dependency-aware context orchestrator.
- um retrieval engine deterministico e explicavel.
- uma base para observabilidade de contexto e benchmarks de qualidade.

### What It Is Not

O Korix Context Compiler nao e:

- um RAG generico.
- um chatbot.
- o `InteractionContextCompiler` do runtime.
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

O criterio de otimizacao e qualidade contextual por token. O compiler pode usar mais tokens quando isso aumenta materialmente a chance de resposta correta, mas deve cortar tokens que carregam baixo sinal para a tarefa.

## Current Repository State

O repositorio atual e uma extensao VSCode TypeScript/Node com runtime agentico ja implementado. O contexto legado ainda fica em `src/context`, mas agora coexiste com o package separado `@korix/context-compiler`:

- `ContextEngine` orquestra indexacao, ranking e montagem de contexto.
- `WorkspaceIndexer` usa APIs do VSCode para listar arquivos e extrair `DocumentSymbol`.
- imports sao extraidos por regex.
- `HeuristicRanker` pontua arquivos por current file, selection, imports diretos, git diff, open tabs, simbolos mencionados e recencia.
- `ContextBuilder` ainda abre documentos via VSCode e produz os arquivos candidatos iniciais para compatibilidade.
- `TokenBudget` estima tokens por `text.length / 4`.
- `ContextEngine.buildContextIr` delega para `@korix/context-compiler` atraves de `createContextCompiler()`.
- `WorkspaceGraphTool` consome o `ContextEngine` pelo container DI e expoe nodes/edges reais derivados do indice atual.
- `InteractionContextCompiler` existe no runtime, mas compila historico de conversa e modo de interacao. Ele nao substitui este compiler de workspace.

O legado ainda e util como scaffold de produto e fallback, mas algumas partes continuam abaixo da tese final do compiler:

- o `ContextBuilder` legado ainda seleciona candidatos a partir de arquivos inteiros.
- a indexacao VSCode ainda usa regex para imports no caminho legado.
- o native compiler ainda usa indice em memoria e scoring deterministico basico.
- ainda nao ha persistencia SQLite, cache warm/cold ou invalidacao por hash.
- summaries, embeddings e reference graph profundo seguem fora do MVP.
- a melhoria de contexto por token ainda precisa de benchmarks de qualidade mais fortes.

A implementacao deve substituir gradualmente esse engine por uma fachada TypeScript que delega o processamento pesado ao Rust, mantendo fallback para reduzir risco durante a migracao.

O objetivo da migracao nao e trocar tudo de uma vez. O primeiro ganho de produto vem de transformar contexto em uma IR auditavel, reduzir full-file stuffing e expor por que cada parte entrou ou ficou fora do prompt.

O novo compiler nao deve ser implementado diretamente dentro de `src/context`. `src/context` deve virar a camada de integracao da extensao com o package separado.

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

- contrato publico de `ContextIR`.
- API publica do package `@korix/context-compiler`.
- adaptador da extensao que converte sinais do VSCode em requests do package.
- VSCode integration.
- extension lifecycle.
- provider communication.
- UI e webview.
- runtime coordination.
- coleta de sinais do editor.
- coleta de diagnostics, git state e open tabs.
- fallback temporario para o engine atual.
- formatacao final do prompt a partir da `ContextIR`.

TypeScript da extensao nao deve virar o motor de parsing, graph traversal ou ranking massivo. O TypeScript dentro do package pode expor API, contratos, loading nativo, fallback leve e formatter, mas nao deve importar `vscode`.

### Suggested Package Layout

```text
packages/
  context-compiler/
    package.json
    src/
      index.ts
      contextIr.ts
      contextFormatter.ts
      nativeContextCompiler.ts
      fallbackContextCompiler.ts
      types.ts
    native/
      Cargo.toml
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

The package must not import `vscode`. It receives plain data structures:

- workspace root.
- file paths and file contents.
- active file and selection ranges.
- open files.
- changed files.
- diagnostics.
- mentioned symbols.
- max token budget.

### Extension Integration Layout

```text
src/context/
  contextEngine.ts
  contextCompilerAdapter.ts
  legacyContextEngine.ts
```

`src/context` owns VSCode-specific collection and compatibility with existing callers. The compiler package owns parsing, graph, retrieval, budget packing, IR generation, explanation and prompt formatting.

### Native Internal Layout

```text
packages/context-compiler/native/
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

The exact names can change during implementation, but the ownership boundary should not: the package owns compiler contracts and implementation; the VSCode extension owns editor integration and runtime orchestration.

### Naming Boundary

There are two different compiler concepts in the codebase:

- `InteractionContextCompiler`: runtime component that compiles chat history, mode-sensitive retries and omitted conversation messages.
- `Korix Context Compiler`: workspace component described in this roadmap; it compiles files, symbols, diagnostics and graph evidence into `ContextIR`.

Do not merge these components. They can feed the same agent loop, but they solve different problems and should remain independently testable.

## v0.1 Vertical MVP

### Goal

Given a user prompt, current editor state and workspace signals, produce a compact, relevant and explainable `ContextIR` in under 100-300ms after warm cache for typical TypeScript/JavaScript workspaces.

The v0.1 should prove the product loop, not the final architecture. It must show that semantic chunks plus deterministic retrieval reduce token usage and improve context quality without making the VSCode extension fragile.

The v0.1 target is not the smallest possible prompt. The target is a prompt with better context value per token than the legacy full-file formatter.

### Must Have

The v0.1 implementation must include:

- separate `@korix/context-compiler` package with its own `package.json`.
- TypeScript `ContextIR` schema and request/response contracts.
- provider formatting from `ContextIR`.
- compatibility adapter from the current `ContextEngine` path to the new IR contract.
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
- reasons for included and omitted context.
- latency and token metrics.
- fallback to current TypeScript engine if native module loading fails.
- `WorkspaceGraphTool` integration through the same DI-owned compiler facade used by the UI/runtime.
- no `vscode` imports in the compiler package.

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
- changes to `InteractionContextCompiler`.
- direct VSCode API usage inside the compiler package.

These are roadmap items. Pulling them into v0.1 would increase risk before the core value is proven.

### v0.1 Success Criteria

The v0.1 is successful when:

- `ContextIR` includes the active file or active symbol for normal editor tasks.
- direct imports and mentioned symbols are selected with clear reasons.
- context formatting avoids full-file stuffing when semantic chunks exist.
- estimated tokens are reduced by at least 50% versus sending selected full files in internal fixtures.
- token reduction does not remove the active symbol, direct dependency symbols or diagnostics needed by the task.
- benchmark fixtures show better context value per token than the legacy full-file baseline.
- context build completes under 300ms after warm cache on small and medium TS workspaces.
- the VSCode extension still activates if the native module is unavailable.
- `@korix/context-compiler` can be unit-tested without activating VSCode.
- `WorkspaceGraphTool` returns real nodes and edges instead of placeholder data.
- `WorkspaceGraphTool` reads graph data from the DI-owned compiler facade, not from a disconnected global singleton.
- `InteractionContextCompiler` tests continue to pass unchanged.

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
  readonly scoreFactors: readonly ContextScoreFactor[];
  readonly reasons: readonly ContextReason[];
  readonly contentMode: "source" | "signature" | "summary";
  readonly content: string;
  readonly dependencies: readonly string[];
  readonly estimatedTokens: number;
}

export interface ContextFile {
  readonly path: string;
  readonly score: number;
  readonly scoreFactors: readonly ContextScoreFactor[];
  readonly includedMode: "full" | "partial" | "metadata";
  readonly reasons: readonly ContextReason[];
  readonly estimatedTokens: number;
}

export interface ContextScoreFactor {
  readonly name:
    | "active_editor_proximity"
    | "symbol_match"
    | "dependency_proximity"
    | "diagnostics_relevance"
    | "git_activity"
    | "open_tab_or_recency"
    | "path_similarity"
    | "legacy_context_priority";
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface OmittedContextItem {
  readonly id: string;
  readonly kind: "file" | "symbol" | "diagnostic";
  readonly path?: string;
  readonly score: number;
  readonly reason:
    | "low_score"
    | "budget_exceeded"
    | "duplicate"
    | "unsupported_language"
    | "external_dependency";
}

export interface ContextCompilerMetrics {
  readonly contextBuildLatencyMs: number;
  readonly selectedFilesCount: number;
  readonly selectedSymbolsCount: number;
  readonly selectedDiagnosticsCount: number;
  readonly selectedRelevantSymbolsCount: number;
  readonly legacyBaselineTokens: number;
  readonly tokenSavingsPercent: number;
  readonly contextValuePerToken: number;
  readonly cacheHitRatio: number;
}
```

Reason codes and score factors are mandatory. Reasons explain the user-facing "why"; score factors explain the tuning math. Without both, context selection becomes hard to debug and impossible to tune safely.

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
        "scoreFactors": [
          {
            "name": "active_editor_proximity",
            "value": 1,
            "weight": 0.25,
            "contribution": 0.25
          },
          {
            "name": "symbol_match",
            "value": 0.95,
            "weight": 0.2,
            "contribution": 0.19
          }
        ],
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
        "scoreFactors": [
          {
            "name": "dependency_proximity",
            "value": 1,
            "weight": 0.15,
            "contribution": 0.15
          }
        ],
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
    "selectedDiagnosticsCount": 0,
    "selectedRelevantSymbolsCount": 3,
    "legacyBaselineTokens": 31000,
    "tokenSavingsPercent": 73,
    "contextValuePerToken": 0.00036,
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

Each factor must be normalized to `0.0..1.0`. Store factor contributions in the IR for selected items and in debug output for omitted items so explanations can show why an item was selected or excluded.

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
- `context_value_per_token`
- `selected_relevant_symbols_count`
- `selected_diagnostics_count`
- `legacy_baseline_tokens`
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
- score factors.
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

Optimizing only for low token count can hurt patch quality. The product goal is better context per token, not minimal prompt size.

Mitigation:

- optimize for task success per token, not token count alone.
- never replace critical selected symbols with summaries when source fits.
- record omitted reasons.
- benchmark against baseline full-file context.
- require benchmark fixtures to assert that critical symbols and diagnostics remain present after compression.

### Risk: Native Package Complexity

napi-rs adds build and packaging concerns to the standalone package and to the VSCode extension that consumes its native artifact.

Mitigation:

- keep native code isolated inside `packages/context-compiler/native`.
- add a TypeScript fallback.
- copy `.node` artifacts explicitly during package and extension builds.
- do not modify the protected CSS build pipeline.

### Risk: DI and Global Engine Drift

The UI/runtime resolves `ContextEngine` through DI, while `WorkspaceGraphTool` currently attempts to use the global `getContextEngine()` path. If both paths diverge, graph data can be empty, stale or unavailable even when the main context engine works.

Mitigation:

- expose graph access through the same DI-owned compiler facade used by the UI/runtime.
- remove the placeholder graph path before making `WorkspaceGraphTool` part of v0.1 acceptance.
- add tests that execute `WorkspaceGraphTool` with an initialized compiler facade.
- avoid adding a second hidden context singleton.

### Risk: Concept Drift Between Compilers

`InteractionContextCompiler` and `Korix Context Compiler` have similar names but different responsibilities. Merging them would couple conversation-history cleanup with workspace retrieval and make both harder to test.

Mitigation:

- keep interaction history compilation in `src/core/runtime/thinking`.
- keep workspace context compilation in `packages/context-compiler`, with VSCode integration only in `src/context`.
- document separate contracts and tests.
- allow orchestration to combine their outputs only at the agent/provider boundary.

## Roadmap

### v0.0 - Contract and Integration Preflight

- Create the package boundary for `@korix/context-compiler`.
- Define TypeScript `ContextIR`, request and explanation contracts.
- Add provider formatter for `ContextIR`.
- Add a legacy adapter in the extension that converts current `ContextWindow` output into compatible IR.
- Add benchmark fixtures that compare legacy full-file context against compiled context by value per token.
- Fix `WorkspaceGraphTool` ownership so it uses the DI/compiler facade path.
- Add contract tests for formatter, fallback and graph-tool integration.
- Keep behavior equivalent to the current engine while establishing the migration seam.

### v0.1 - Vertical Compiler MVP

- standalone `@korix/context-compiler` package consumed by the extension.
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
- no dependency on VSCode APIs inside the package.
- measured token reduction against the legacy full-file formatter.
- measured improvement in context value per token against the legacy full-file formatter.

Current implementation status:

- `@korix/context-compiler` is now on the production `ContextEngine.buildContextIr` path through `createContextCompiler()`.
- The extension still uses the legacy context builder to collect initial candidate files, then delegates IR construction to the package compiler.
- The TypeScript fallback preserves legacy selection priority through `WorkspaceFileInput.selectionPriority`.
- If the compiler backend fails, `ContextEngine` falls back to the legacy `ContextWindow` to `ContextIR` adapter.
- The native module now exports the complete `ContextCompiler` function surface: `initialize`, `indexWorkspace`, `updateFile`, `removeFile`, `buildContextIr` and `explainSelection`.
- Native IR generation is still intentionally small: in-memory index, TS/JS tree-sitter parsing, basic deterministic file scoring, symbol extraction for selected files and budget omission.
- The build now copies existing native `.node` artifacts into `dist/native`, and the bundled loader checks that path before falling back.
- Native target selection is explicit and test-covered for Darwin, Linux glibc/musl and Windows MSVC targets.
- The build writes `dist/native/context-compiler-native-manifest.json` with copied artifacts and supported targets for packaging diagnostics.
- The native manifest now also records per-artifact byte counts and `totalArtifactBytes`, giving release packaging an objective signal for deciding whether a future per-platform VSIX split is needed.
- `vscode:prepublish` builds the native compiler before compiling the extension, so VSIX packaging can include the native artifact.
- GitHub Actions now defines a native build matrix for every supported target and assembles the Darwin universal artifact from arm64/x64 outputs.
- The native workflow is covered by a repository test that prevents the CI target matrix from drifting away from `NATIVE_CONTEXT_COMPILER_TARGETS`.
- The native workflow now includes a VSIX packaging job that downloads all native artifacts, compiles the extension, verifies the native manifest and uploads a single VSIX artifact.
- The VSIX packaging job now fails if the native manifest is incomplete: copied artifact count must match supported target count, per-artifact byte diagnostics must exist, and `totalArtifactBytes` must be positive.
- The native manifest validation rule is now a checked-in script used by CI and covered by positive/negative repository tests; PR changes to the validator trigger the native workflow.
- The workflow trigger path for the native manifest validator is regression-tested so validator changes cannot stop exercising the native packaging workflow silently.
- The native manifest validator now checks artifact names against `NATIVE_CONTEXT_COMPILER_TARGETS`, rejects duplicate artifact/byte entries and verifies `totalArtifactBytes` equals the per-artifact byte sum.
- The native manifest validator resolves the package target source from the script location, so validation no longer depends on running from the repository root.
- Duplicate native artifact and byte-diagnostic manifest failures now have explicit regression coverage.
- The release packaging policy for now is one VSIX containing all available native artifacts, with TypeScript fallback if a runtime target is missing.
- A post-v1 packaging hardening guard now prevents the `esbuild.config.js` native artifact copy target list from drifting away from `NATIVE_CONTEXT_COMPILER_TARGETS`, complementing the existing CI workflow matrix guard.
- Provider formatting now prioritizes semantic symbol chunks from package `ContextIR`; when a selected file already has symbol chunks, full file content is omitted from the provider prompt and retained only as file metadata.
- Rust parsing/scoring and TypeScript fallback/formatting are now covered by focused tests, including native score reasons, active-file symbol chunks and fallback full-file formatting when semantic chunks are unavailable.
- Package setup, native build/test commands, packaging flow and troubleshooting are documented in `packages/context-compiler/README.md`.
- The roadmap current-state section has been reconciled with the implemented v0.1 package/native/DI graph integration.
- The remaining native risk is validating the cross-compile toolchains in CI under real release conditions; the artifact-size decision now has manifest telemetry through `totalArtifactBytes`.

### v0.2 - Persistence and Cache Discipline

- SQLite warm/cold persistence.
- file metadata persistence.
- symbol index persistence.
- graph edge persistence.
- cache invalidation by content hash, parser version and strategy version.
- startup warm cache.

Current implementation status:

- In-memory cache discipline now uses file content hashes in both the TypeScript fallback and native compiler paths.
- `cacheHitRatio` is now reported from indexed file hash reuse, so unchanged request files can be distinguished from changed files before adding SQLite persistence.
- Cache hits now also require matching parser and strategy versions, preparing the cache key for safe persistence.
- The TypeScript package now exports its cache strategy metadata so persistence code can depend on an explicit cache-key contract instead of hidden constants.
- The TypeScript package now exposes a persistable cache snapshot shape for file metadata, including content hash, parser version, strategy version, language, last modified timestamp and estimated tokens.
- The TypeScript fallback hash strategy is explicitly named `fnv1a32-utf16`; it is treated as a local versioned cache-key component, not as a cross-backend checksum.
- The TypeScript fallback now has optional SQLite warm/cold file metadata persistence through `cacheDatabasePath` when the current Node runtime can load `node:sqlite` without flags.
- The extension DI wires the compiler cache database under `ExtensionContext.globalStorageUri` only when SQLite support is proven at runtime; Node 18/20 runtimes keep the native compiler path and do not regress to fallback.
- `ContextCompiler.dispose()` now closes compiler-owned resources, and `ContextEngine.dispose()` closes the compiler facade.
- Cache persistence is guarded against stale roots: fallback initialization clears in-memory files/cache before loading a compatible persisted snapshot.
- SQLite schema initialization closes the database handle if setup fails.
- SQLite snapshots now persist lightweight import graph edges in addition to file metadata.
- Graph edge extraction handles static import/export declarations, CommonJS require assignments, multiline import/export statements and avoids obvious comments/string-literal false positives.
- Warm SQLite snapshots preserve existing file metadata and graph edges during incremental `updateFile` and `removeFile` calls instead of truncating entries for files not present in memory.
- `ContextCacheSnapshot.graphEdges` remains optional for compatibility with manual snapshot creators.
- Independent subagent review approved the SQLite graph-edge persistence slice after validating incremental warm-cache behavior and import extraction edge cases.
- `ContextEngine` now supports startup compiler warmup from the DI-owned workspace root so persisted compiler cache can be loaded before the first request.
- Startup warmup is single-flight and best-effort: concurrent initialization reuses the same promise, compiler warmup failure is logged and does not break context indexing, and extension activation catches initialization failures.
- The extension no longer treats `process.cwd()` as a real workspace root for compiler warmup; windows without a VSCode workspace skip compiler root initialization instead of warming against an arbitrary process directory.
- Native compiler remains preferred when available even if cache options are present; SQLite persistence is not a reason to downgrade a native backend.
- `WorkspaceIndexer` initialization is single-flight and no longer requires a global logger in isolated code paths.
- Independent subagent review approved the startup warm-cache slice after validating single-flight initialization, no-workspace behavior, best-effort warmup and native preservation.
- Native wrapper SQLite persistence is implemented: the wrapper loads warm snapshots on initialization, persists file metadata and lightweight graph edges after `indexWorkspace`, `updateFile` and `removeFile`, and closes cache resources on `dispose()`.
- Native persisted snapshots use native cache metadata (`fnv1a64-utf8`, `tree-sitter-ts-js-v1`, `native-score-v1`) instead of fallback cache metadata.
- Native initialization failure closes the SQLite store and clears partial root/snapshot state before rethrowing, avoiding leaked handles or half-initialized cache state.
- Native incremental SQLite behavior is covered for update/remove reloads, and independent subagent review approved the native persistence slice after validating strategy metadata, cleanup and incremental correctness.
- SQLite snapshots now persist source-hashed summary cache entries and preserve matching summaries across warm full-index refreshes while dropping stale summaries when files change.

### v0.3 - Stronger Semantic Resolution

- reference graph improvements.
- optional tsserver/LSP integration.
- path alias resolution.
- export/import resolution for TypeScript projects.
- better monorepo boundaries.

Current implementation status:

- First v0.3 semantic-resolution slice is implemented in both TypeScript fallback and Rust native backend.
- The compiler now resolves direct dependencies of the active file into workspace files and scores them with `dependency_proximity` plus `direct_dependency` reasons.
- Dependency resolution handles extension candidates (`.ts`, `.tsx`, `.js`, `.jsx`) and `index` files.
- Simple `tsconfig.json` `compilerOptions.baseUrl` and `compilerOptions.paths` aliases are supported for direct dependency resolution.
- Alias resolution works for absolute and relative workspace file paths without depending on `process.cwd()`.
- Exact non-wildcard `paths` aliases require exact specifier matches; wildcard aliases continue to resolve through their captured segment.
- Native parser now extracts re-export edges from `export ... from`, while avoiding false edges from ordinary exported string literals.
- TypeScript fallback and native behavior are covered for alias happy paths, relative paths and exact-alias non-matches.
- Independent subagent review initially blocked the slice on native export false positives and alias path correctness; fixes were applied, validation reran, and re-review approved the slice.

### v0.4 - Summaries and Memory

- source-hashed summaries.
- rolling summaries.
- recursive summaries for distant context.
- strict rule: critical hot-path symbols use source when source fits.
- separate `source_context` and `summary_context`.

Current implementation status:

- First v0.4 summaries slice is implemented in the package `ContextIR` contract through `ContextSummary` and `CompiledContext.summaries`.
- TypeScript fallback and Rust native backend now emit deterministic source-hashed file summaries when a relevant scored file exceeds the source budget and the summary still fits the remaining budget.
- Over-budget files remain explicitly omitted with `budget_exceeded`; summaries are additional compressed evidence, not hidden replacements.
- Provider formatting now emits a dedicated `## Summary Context` section with source hash, token estimate and summary reasons.
- Legacy adapter/test fixtures include `summaries: []`, preserving compatibility for existing IR constructors.
- This slice intentionally does not add embeddings, LLM-generated summaries or rolling memory yet.
- Source-hashed summary cache persistence is implemented for fallback and native wrapper snapshots through SQLite.
- Independent subagent review approved the slice after validating budget accounting, formatter behavior, native/fallback alignment and package boundary cleanliness.

### v0.5 - Tool and Terminal Output Optimization

- terminal error extraction.
- stacktrace compression.
- relevance filtering for command output.
- diagnostic-aware terminal summaries.
- avoid sending thousands of log lines to the model.

Current implementation status:

- First v0.5 package-only slice is implemented through `optimizeToolOutput`.
- Long command/tool output is compressed deterministically by prioritizing error lines, stack trace lines and tail context.
- Short output is returned unchanged.
- The optimizer returns original/optimized/omitted character counts, omitted lines and explicit reasons such as `terminal_output_compressed`, `error_lines_prioritized` and `tail_context_retained`.
- Diagnostic-aware metadata is represented through the `diagnostics_available` reason when diagnostics are present.
- Runtime observations now use `optimizeToolOutput` for long terminal output, extracting structured `RunCommand` stdout/stderr/error data before compression and sending optimized terminal evidence plus omission metadata in provider tool messages.
- Independent subagent review approved the slice after validating budget enforcement, omission metrics, test coverage and package boundary cleanliness.

### v0.6 - Patch Optimization

- separate Patch Engine from Context Compiler.
- Patience Diff primary.
- Myers Diff fallback.
- atomic writes.
- rollback snapshots.
- conflict detection.
- minimal patching.

Current implementation status:

- First v0.6 package-only slice is implemented through `optimizeReplacementPatch`.
- Given original and modified file content, the optimizer emits a smaller `KORIX_PATCH` replacement window by trimming common prefix/suffix lines and retaining configurable context lines.
- Unchanged content returns no patch deterministically.
- Insertions and deletions are covered, including zero-context insertions that must still produce non-empty `SEARCH` anchors.
- Empty original content does not emit an invalid empty-search patch; it returns `patch_anchor_unavailable` for future create-file handling.
- This slice does not replace the VSCode patch applier yet and does not claim Patience/Myers diff implementation; it establishes the package patch-optimization contract and safety tests first.
- Independent subagent review initially blocked the slice on empty `SEARCH` insertion patches; fixes were applied, validation reran, and re-review approved the slice.

### v0.7 - Embeddings Fallback

- optional embeddings for ambiguous semantic retrieval.
- no vector DB dependency in default local path.
- embeddings supplement deterministic retrieval; they do not replace it.

Current implementation status:

- First v0.7 package-only slice is implemented through `rankEmbeddingFallback`.
- The package can rank externally supplied embedding vectors by cosine similarity with `maxResults` and `minScore` controls.
- The default local path still owns no embedding provider, no vector DB and no embedding storage.
- Invalid dimensions, zero vectors and non-finite vector values (`NaN`, `Infinity`) are skipped to avoid misleading matches.
- The feature supplements deterministic retrieval only when callers provide vectors explicitly.
- Independent subagent review initially blocked the slice on non-finite vector handling; fixes were applied, validation reran, and re-review approved the slice.

### v1.0 - Production Compiler Runtime

- stable package API with semver discipline.
- multi-language adapters.
- worker pools with bounded queues.
- background indexing.
- graph snapshots.
- advanced observability.
- quality benchmarks.
- debug UI for power users.
- measured improvement in patch accept rate and task completion.
- context value per token tracked as a first-class quality metric.

Current implementation status:

- First v1.0 readiness/observability slice is implemented through `getContextCompilerCapabilities()`.
- The package now exposes deterministic package name/version, `ContextIR` version and feature maturity statuses.
- The maturity contract is intentionally conservative: `context-ir` is marked `stable`, implemented compiler capabilities are marked `experimental`, and future hardening work remains `planned`.
- The API gives runtime/debug surfaces a stable way to report what the compiler can do without overstating production readiness.
- A first quality benchmark slice is implemented through `benchmarkContextQuality`.
- The benchmark helper checks retained required files, symbols and diagnostics, token savings against a baseline, evidence coverage and context value per token.
- Missing evidence and failed metric thresholds are reported explicitly, so benchmark fixtures can fail when compression drops critical context.
- Benchmark samples can now be summarized with aggregate token savings, evidence coverage, context value per token, patch accept rate delta and task completion rate delta.
- Versioned benchmark fixture sets can now be executed through `runContextQualityBenchmarkFixtures`, producing deterministic pass/fail reports with failed fixture ids, per-sample results and aggregate quality metrics.
- The outcome aggregation is package-only and expects observed baseline/compiled results from fixtures or runtime telemetry; it does not invent task success.
- A package-only quality telemetry collector is implemented through `createContextQualityTelemetrySample` and `ContextQualityTelemetryBuffer`.
- The telemetry collector records only observed patch/task outcomes, keeps missing outcomes undefined and summarizes paired baseline/compiled outcomes without inferring success.
- Runtime quality telemetry wiring is implemented in `AgentExecutor`: the executor listens to the shared `RuntimeEventEmitter`, records observed `EditFile` patch outcomes from real `tool_result` events, records task completion from `execution_complete`, and keeps baseline outcomes absent unless explicitly observed.
- A bounded async worker pool primitive is implemented through `BoundedContextWorkerPool`.
- The worker pool supports fixed concurrency, bounded waiting queues, explicit full/disposed rejections and snapshot metrics for future background indexing.
- A package-level background indexing scheduler is implemented through `BackgroundContextIndexer`.
- The scheduler queues `indexWorkspace`, `updateFile` and `removeFile` operations through the bounded worker pool while preserving compiler result types.
- Deterministic package-level graph snapshots are implemented through `createContextGraphSnapshot`, deriving nodes, import edges and reverse import links from existing cache metadata without inventing symbol data.
- The extension `ContextEngine` now routes compiler `indexWorkspace` calls through `BackgroundContextIndexer`.
- Runtime behavior remains conservative: `buildContextIr` still awaits indexing before building IR, but concurrent index requests are now serialized through the bounded package worker pool.
- Non-blocking incremental background refresh is implemented for workspace create/change/delete events: `WorkspaceIndexer` emits plain file events outside the initial full scan, and `ContextEngine` schedules compiler `updateFile`/`removeFile` work through the background indexer without awaiting the watcher path.
- A compact observability/debug snapshot helper is implemented through `createContextCompilerDebugSnapshot`.
- Debug snapshots expose package features, budget, metrics, top evidence metadata, worker snapshots and benchmark summaries without embedding source content or dumping full IR.
- A first power-user debug surface is implemented through the `Korix: Explain Context Selection` command, which opens a compact Markdown snapshot of budget, metrics, selected evidence, reasons and feature maturity without touching the webview/CSS pipeline.
- A default multi-language adapter registry is implemented through `getDefaultContextLanguageAdapters` and `resolveContextLanguageAdapter`.
- The adapter registry marks TypeScript/JavaScript as tree-sitter-backed and Rust/Java/Python as lightweight text-backed, avoiding a false claim of deep native semantics for non-TS/JS languages.
- The TypeScript fallback compiler now extracts lightweight Python class/function symbols and Java class/interface/method symbols, emits them as semantic chunks, prunes overlapping container/nested symbols, and repacks chunks to stay within `maxTokens`.
- The lightweight non-TS/JS fallback parser now recognizes Python `async def` functions and Java constructors, improving semantic chunks for common backend code without claiming deep LSP semantics.
- The lightweight non-TS/JS fallback parser now also extracts Rust `struct`, `enum`, `trait`, `impl` and `fn`/`async fn` symbols with braced-block ranges and semicolon declaration handling.
- `quality-benchmarks` is exposed as an experimental package capability.
- `worker-pools` is now exposed as an experimental package capability.
- `background-indexing` is exposed as an experimental package capability and has a first conservative `ContextEngine` integration.
- `graph-snapshots` is exposed as an experimental package capability and currently reflects cache-level import metadata.
- `debug-snapshots` is exposed as an experimental package capability; the first VSCode command UI is available, while richer webview visualization remains future work.
- `language-adapters` is exposed as an experimental package capability; Rust/Java/Python text adapters are available, while deeper tree-sitter/LSP-backed non-TS/JS parsing remains future work.
- `quality-telemetry` is exposed as an experimental package capability and has first runtime wiring for observed compiled patch/task outcomes.
- The `Korix: Explain Context Selection` debug command now includes the shared runtime context quality telemetry summary, exposing compact aggregate quality metrics without source content.
- The scoped v1.0 roadmap is complete. Deeper non-TS/JS parser implementations and richer debug visualization remain post-v1 production hardening, not blockers for the current compiler runtime.
- Independent subagent review approved the slice after validating package boundary cleanliness, readonly public types, deterministic version fields and the honesty contract.
- Independent subagent review approved the quality benchmark slice after validating deterministic local behavior, export/type coherence, convention compliance and pass/fail test coverage.
- Independent subagent review approved the benchmark fixture runner after validating pass/fail semantics, empty fixture behavior, exports and package boundary cleanliness.
- Independent subagent review approved the outcome aggregation slice after validating public API coherence, paired outcome handling, deterministic empty summaries and convention compliance.
- Independent subagent review approved the worker pool slice after validating queue capacity semantics, dispose behavior, metric snapshots, package boundary cleanliness and public API coherence.
- Independent subagent review approved the background indexing scheduler slice after validating typed result propagation, package boundary cleanliness, exported readonly types and scheduler result tests.
- Independent subagent review approved the graph snapshot slice after validating deterministic output, package boundary cleanliness, honest empty-symbol semantics and capability maturity.
- Independent subagent review approved the debug snapshot slice after validating compactness, source-content omission, exported readonly types, feature compaction and limit/sort behavior.
- Independent subagent review initially blocked the language adapter slice on conflicting `languageId`/extension resolution; fixes were applied, validation reran, and re-review approved the slice.
- Independent subagent review approved the `ContextEngine` background-indexing integration after validating behavior preservation, fallback coverage, bounded queue use and dispose ordering.
- Independent subagent review approved the worker-pool failure-path regression after validating failed-task accounting, queue draining after rejection and roadmap maturity wording.
- Independent subagent review approved the quality telemetry slice after validating observed-outcome semantics, paired outcome aggregation, copied sample snapshots and public API coherence.
- Independent subagent review initially blocked runtime quality telemetry because synthetic patch events were not emitted by the real edit path; fixes attached telemetry to the shared runtime emitter and observed real `EditFile` `tool_result` events, and re-review approved the slice.
- Independent subagent review approved the non-blocking incremental refresh slice after validating initial-scan suppression, plain file events, background scheduling, no-root no-op behavior and package boundary cleanliness.
- Independent subagent review approved the debug command slice after validating command registration, VSCode selection typing, compact Markdown output, source-content omission and no protected CSS/webview changes.
- Independent subagent review approved the lightweight Java/Python fallback parser slice after initially blocking budget edge cases; fixes added overlap pruning, metadata compaction and final symbol packing within `maxTokens`.
- Independent subagent review approved the lightweight non-TS/JS parser hardening after validating Python `async def`, Java constructor detection and self-type-returning Java methods.
- Independent subagent review initially blocked the lightweight Rust adapter slice on semicolon/range handling; fixes made semicolon declarations and braced blocks order-aware, validation reran, and re-review approved the slice.
- Independent subagent review approved the post-v1 native packaging drift guard after validating package target source-of-truth coverage, CI workflow coverage, esbuild copy-path coverage and convention compliance.
- Independent subagent review approved the native artifact size diagnostics after validating manifest compatibility, CI packaging compatibility, no-artifact fallback behavior and README guidance.
- Independent subagent review approved the CI native manifest completeness gate after validating copied artifact count checks, byte diagnostic checks and reduced false-success risk for incomplete native VSIX packaging.
- Independent subagent review initially blocked the checked-in native manifest validator because workflow path filters did not include the validator script; the path filter was fixed, validation reran, and re-review approved the slice.
- Independent subagent review approved the workflow path-filter regression guard after validating that the test targets the `pull_request.paths` trigger rather than only the packaging command.
- Independent subagent review initially blocked strict native manifest validation because unknown `supportedTargets` were still internally self-consistent; the validator now reads `NATIVE_CONTEXT_COMPILER_TARGETS`, rejects unknown targets, and re-review approved the slice.
- Independent subagent review approved the native manifest validator cwd-hardening after validating script-location target resolution, caller-relative manifest behavior and non-repository cwd test coverage.
- Independent subagent review approved the duplicate native manifest regression coverage after validating duplicate artifact and duplicate byte-diagnostic guard coverage.
- Independent subagent review initially blocked runtime terminal-output optimization because optimizing `JSON.stringify` of structured `RunCommand` payloads could drop real stdout/stderr evidence; terminal extraction now handles direct and failed-wrapper payloads before compression, and re-review approved the slice.
- Independent subagent review approved the quality telemetry debug-surface integration after validating the shared DI buffer, single command execution, compact Markdown output and source-content omission.
- Independent subagent review initially blocked persisted summary-cache support because warm full-index refreshes dropped loaded summaries; fallback and native indexing now preserve hash-matching summaries and re-review approved the slice.

## Implementation Handoff

This section is the handoff for the engineer or agent implementing v0.1.

### Implementation Order

1. Add package scaffold under `packages/context-compiler`. `[done]`
2. Add package-local TypeScript `ContextIR`, request and explanation types. `[done]`
3. Add package-local `contextFormatter` that formats `ContextIR` for providers. `[done]`
4. Add package exports and tests that run without VSCode activation. `[done]`
5. Add an extension adapter under `src/context` that calls the package while preserving current `ContextEngine` behavior. `[done]`
6. Add a legacy adapter in the extension that turns the current `ContextWindow` into `ContextIR`. `[done]`
7. Fix `WorkspaceGraphTool` to consume graph data through DI/compiler facade instead of the global singleton path. `[done]`
8. Add tests for formatter, legacy fallback and `WorkspaceGraphTool` integration. `[done]`
9. Add native scaffold inside `packages/context-compiler/native`. `[done]`
10. Configure Rust `cdylib` with napi-rs. `[done]`
11. Add tree-sitter TypeScript/JavaScript dependencies. `[done]`
12. Implement parser functions for TS/JS source files. `[done]`
13. Implement Rust structs for files, symbols, imports, graph nodes and IR. `[done]`
14. Expose napi functions: `[done]`

- `initialize`
- `indexWorkspace`
- `updateFile`
- `removeFile`
- `buildContextIr`
- `explainSelection`

15. Add `NativeContextCompiler` wrapper with safe dynamic loading inside the package. `[done]`
16. Update the extension `ContextEngine` adapter to call the package compiler when available. `[done]`
17. Preserve the current TypeScript context path as fallback. `[done]`
18. Replace provider formatting to use semantic chunks from package IR when available. `[done]`
19. Add tests for Rust parsing/scoring and TypeScript fallback/formatting. `[done]`
20. Update build/package scripts to include the package and native artifacts. `[done]`
21. Document package setup, native setup and troubleshooting. `[done]`
22. Define supported native targets and packaging manifest for copied artifacts. `[done]`
23. Add CI workflow for all supported native targets and Darwin universal assembly. `[done]`
24. Add CI VSIX packaging job that assembles downloaded native artifacts into the extension package. `[done]`

### Compatibility Requirements

- Do not break `pnpm run compile`.
- Do not make `@korix/context-compiler` depend on `vscode`.
- Do not modify `src/webview/main.css`, `dist/webview.css` or esbuild CSS handling.
- Do not remove the current context engine until native fallback is proven.
- Do not introduce `any` in TypeScript.
- Use `??` for defaults.
- Keep runtime layer free of VSCode imports where existing architecture requires it.

### Suggested v0.1 Package API

```typescript
export interface WorkspaceFileInput {
  readonly path: string;
  readonly content: string;
  readonly language?: string;
  readonly lastModified?: number;
  readonly selectionPriority?: number;
}

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
  readonly files: readonly WorkspaceFileInput[];
}

export interface ContextCompiler {
  initialize(root: string, options: ContextCompilerOptions): Promise<void>;
  indexWorkspace(files: readonly WorkspaceFileInput[]): Promise<IndexSummary>;
  updateFile(file: WorkspaceFileInput): Promise<IndexSummary>;
  removeFile(path: string): Promise<void>;
  buildContextIr(request: BuildContextIrRequest): Promise<ContextIR>;
  explainSelection(
    request: BuildContextIrRequest,
  ): Promise<ContextSelectionExplanation>;
}
```

This API belongs to `@korix/context-compiler`. The extension adapter is responsible for reading VSCode documents, diagnostics, tabs and git state, then passing plain `WorkspaceFileInput` and request objects to the package.

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

The provider prompt should not dump the full debug IR. Keep `scoreFactors`, detailed omitted items and benchmark metrics available for explainability/debug paths, but format only the compact evidence the model needs for the current task.

## Acceptance Criteria

The roadmap document is complete when:

- v0.0 contract/integration preflight is explicit before native implementation.
- `@korix/context-compiler` is defined as a separate package boundary.
- the package is explicitly forbidden from importing `vscode`.
- better context per token is documented as the core product function.
- token savings are balanced against preserving critical task evidence.
- v0.1 is clearly separated from the final architecture.
- Rust, napi-rs and tree-sitter are marked as mandatory for the hot path.
- TypeScript responsibilities are limited to VSCode integration, orchestration, provider communication, UI and runtime coordination.
- summaries, embeddings, SQLite and patch optimization are clearly deferred to roadmap phases.
- the current repository state is accurately described.
- the gradual replacement strategy for the existing context engine is explicit.
- the `ContextIR` contract is concrete enough for implementation.
- `WorkspaceGraphTool` ownership and DI integration risk are documented.
- `InteractionContextCompiler` is clearly separated from workspace context compilation.
- the roadmap covers v0.0 through v1.0.
- another engineer can start implementation without reinterpreting product intent.
