# Project: a208269-br-fintech_bank-korix-code-plugin

AI-native coding runtime agentic - um assistente de código inteligente, rápido e controlável integrado ao VSCode

Managed by Axiom Agents. Stack: typescript/node.

**Status**: ✅ Phase 4 Runtime Complete (event-driven agentic loop, 83 tests passing)

## Stack

- **Language**: typescript
- **Framework**: node
- **Package Manager**: pnpm
- **Build Tool**: tsc
- **Test Runner**: vitest
- **Lint Tool**: eslint

## Commands

```bash
pnpm run lint  # eslint src --ext ts
pnpm run test  # vitest
pnpm run format  # prettier --write "src/**/*.ts"
```

## Project Structure

```
docs/
src/
  context/
  core/
    runtime/        # ✅ Phase 4 - Event-driven agent runtime (11 files, 83 tests)
      agentLoop.ts
      cancellation.ts
      checkpoints.ts
      executionEngine.ts
      iterationGuard.ts
      recovery.ts
      runtimeEvents.ts
      runtimeMetrics.ts
      runtimeState.ts
      runtimeTypes.ts
      taskQueue.ts
  harness/
  modes/
  providers/
  telemetry/
  terminal/
  tools/          # 18 tools registered (filesystem, git, search, diagnostics, workspace)
  ui/
```

## Runtime Architecture (Phase 4)

**Event-Driven Agentic Loop**: 24+ typed events covering lifecycle, provider streaming, tool execution, checkpoints, recovery, and guards.

**Core Components**:
- **AgentLoop** (193 lines): Minimalist lifecycle orchestrator - delegates to specialized managers
- **ExecutionEngine** (253 lines): Brain - processes provider streams, executes tools, manages state
- **RuntimeState** (290 lines): 4 modular states (Conversation, Execution, Workspace, Memory) with snapshot/restore
- **CheckpointManager** (105 lines): Incremental file snapshots with SHA-256 hashing, rolling window of 10
- **RecoveryManager** (126 lines): Exponential backoff (1s→2s→4s), auto-rollback after 3 retries
- **IterationGuard** (88 lines): Loop prevention - max 25 iterations, stall detection (30s), duplicate tools (>3), no-progress (3 identical iterations)
- **CancellationManager** (64 lines): AbortController integration with cleanup callbacks
- **RuntimeMetrics** (74 lines): Token counts, tool breakdown, event timeline
- **TaskQueue** (65 lines): Priority queue with per-task AbortController

**Design Decisions**:
- Sequential tool execution (deterministic order, no race conditions)
- Checkpoint only modified files (~10 files vs entire workspace)
- Max 25 iterations (empirical from Cursor/Claude Code)
- Node.js `fs/promises` instead of vscode.workspace.fs (testability)
- Readonly getters, mutable internal state

**Test Coverage**: 83 unit tests across 4 suites, 100% passing

## Code Conventions

- Use `??` (nullish coalescing) — NEVER `||` for default values
- NEVER use `any` type anywhere
- Mark all interface/type properties as `readonly`
- Keep files under 400-500 lines — refactor if approaching limit
- Test descriptions in English
- Runtime layer must NOT import from vscode (use Node.js APIs)

## Anti-patterns — NEVER do this

### TypeScript
- `||` for defaults → use `??`
- `as any` anywhere → type it properly
- `catch (e: any)` → use `catch (e: unknown)`
- Deep relative `../../../../` from apps → use package aliases
- vscode imports in `src/core/runtime/*` → breaks testability

## Available Tools (19 registered)

**Filesystem** (5): ReadFile, WriteFile, ListDirectory, FileChunks, SearchFiles  
**Terminal** (1): RunCommand  
**Edit** (1): EditFile (KORIX_PATCH format)  
**Git** (3): GitStatus, GitDiff, ChangedFiles  
**Search** (3): Grep, FindReferences, FindSymbols  
**Diagnostics** (2): Problems, GetDiagnostics  
**Workspace** (3): WorkspaceGraph, GetOpenFiles, GetCurrentFile  
**User Interaction** (1): AskUserQuestion

## Interactive Questions (AskUserQuestion)

**Use AskUserQuestion when the user needs to CHOOSE between multiple valid technical approaches where their preference matters.**

DO NOT use for questions with factual answers or when explaining concepts.

Use this tool to present structured options when user input is required for decision-making.

### When to Ask Questions

**USE AskUserQuestion when:**
- User explicitly asks to "choose between" or "compare" multiple options
- User asks "which X should I use for Y?" AND multiple valid answers exist
- Technical decision requires user preference (e.g., DB choice, framework choice)
- User says "me apresente as opções" / "show me options" / "present options"
- User asks "de forma interativa" / "interactively"

**Examples where AskUserQuestion is appropriate:**
- "qual banco de dados você recomenda para sistema com 1M users?" → AskUserQuestion with PostgreSQL, MongoDB, Redis (multiple valid choices)
- "me apresente as opções de autenticação" → AskUserQuestion with JWT, Session, OAuth2
- "escolha entre Docker e Kubernetes para deploy" → AskUserQuestion with comparison
- "qual estratégia de cache usar?" → AskUserQuestion (depends on requirements)

**DO NOT use AskUserQuestion when:**

❌ **Questions with factual answers:**
  - "o que é TypeScript?" → explain directly
  - "como funciona async/await?" → explain directly
  - "qual a sintaxe de X?" → show syntax directly
  - "o que faz essa função?" → analyze and explain

❌ **Trivial/social queries:**
  - "olá quem é vc?" → introduce yourself
  - "como você funciona?" → explain your capabilities
  - "o que você pode fazer?" → list your features
  - "qual é seu nome?" → answer directly

❌ **Questions where ONE correct answer exists:**
  - "qual o tipo de retorno correto?" → analyze and answer
  - "esse código tem bug?" → diagnose and explain
  - "como eu faço um for loop em TypeScript?" → show code example
  - "qual a sintaxe do git commit?" → show syntax

❌ **User is asking for explanation, not decision:**
  - "qual a diferença entre X e Y?" → explain differences
  - "por que usar X?" → explain rationale
  - "como X funciona?" → explain mechanism
  - "o que é SOLID?" → explain principles

✅ **ONLY use when user must CHOOSE between multiple valid options:**
  - "qual banco usar: Postgres ou Mongo?" → present tradeoffs
  - "me apresente as opções de deploy" → show options
  - "escolha entre JWT e session" → present comparison

### Decision Tree

Ask yourself before using AskUserQuestion:

1. **Is there ONE objectively correct answer?** → Answer directly
2. **Am I explaining a concept?** → Answer directly
3. **Does the user need to make a CHOICE between valid options?** → Use AskUserQuestion
4. **Is this a trivial/social question?** → Answer directly

**Rule of thumb:** If you can answer confidently in 2-3 sentences, DON'T use AskUserQuestion.

### How to Structure Questions

```typescript
// Single choice (radio buttons) - user picks ONE
AskUserQuestion({
  questions: [{
    question: "Qual estratégia usar para implementar autenticação?",
    header: "Estratégia Auth",
    multiSelect: false,
    options: [
      {
        label: "JWT com refresh tokens",
        description: "Stateless, escalável, complexidade média. Requer Redis para blacklist."
      },
      {
        label: "Session-based com cookies",
        description: "Simples, stateful, requer session store. Melhor para monólitos."
      },
      {
        label: "OAuth2 + Auth0",
        description: "Terceirizado, menos controle, custo adicional. Zero manutenção."
      }
    ]
  }]
})

// Multiple choice (checkboxes) - user picks MANY
AskUserQuestion({
  questions: [{
    question: "Quais testes executar antes do PR?",
    header: "Suite de Testes",
    multiSelect: true,
    options: [
      { label: "Unit tests", description: "Rápido (~30s), cobertura de funções isoladas" },
      { label: "Integration tests", description: "Médio (~2min), testa APIs e banco" },
      { label: "E2E tests", description: "Lento (~10min), cobertura completa do fluxo" }
    ]
  }]
})
```

### Best Practices

- **Clear context**: Explain WHY you're asking (what's ambiguous or risky)
- **Good options**: Each option should have trade-offs explained in description
- **Reasonable defaults**: If timeout happens, first option is auto-selected
- **Limit choices**: 2-4 options max (use multiSelect for >4 if needed)
- **Respect answer**: Don't re-ask or second-guess user's choice

### Examples of Good Questions

✅ "Encontrei 3 estratégias válidas para cache (Redis, in-memory, hybrid). Qual usar?"  
✅ "Código legado usa padrão X, novo código usa Y. Refatorar tudo ou manter híbrido?"  
✅ "Deploy detectou 15 testes falhando. Rollback, skip testes, ou investigar?"  
✅ "Encontrei 2 bugs críticos. Qual priorizar? (ambos afetam produção)"

### Examples of Bad Questions

❌ "Devo usar TypeScript?" (já definido no stack)  
❌ "Qual cor para o botão?" (trivial, não técnico)  
❌ "Continuar?" (vago, sem contexto)  
❌ Perguntar algo que o CLAUDE.md ou requisitos já definiram

## Axiom Plugin

This project uses the Axiom Agents plugin at `axiom-plugin/`.
Run Claude Code with: `claude --plugin-dir axiom-plugin/`

### Available Commands

- `/axiom-auto-fix-v2` — Vision-driven frontend auto fix pipeline for IBK Internet Banking. Analyzes design images, matches to IBK design system (shared-ui, shared-assets), defines RTK Query services, implements components, and verifies against Figma. BFF endpoints (integration-zeztra-bff) are defined as contracts but implemented separately.
- `/axiom-auto-fix` — ADO-driven fix pipeline — fetch work items, triage, branch, implement, review, test, build, PR, update ADO, document solution
- `/axiom-bug-fix` — Bug fix pipeline — knowledge search, explore, diagnose, visual comparison, branch, fix, verification, quality checks, review, PR
- `/axiom-compound` — Document solutions from completed work — gather history, extract patterns, assemble document, commit
- `/axiom-cost-analysis` — Cloud cost analysis — gather context, analyze patterns, generate report (read-only)
- `/axiom-doc-gen` — Documentation generation — scope, analyze, generate, save
- `/axiom-feature-dev` — Full pipeline with architecture, implementation, testing, observability, cost analysis, and review
- `/axiom-ibk-e2e-from-qa-task` — Lean QA-facing workflow. Reads the E2E configuration block authored by QA inside the [QA] child task description in ADO (URL, credentials, coverage, scenarios) and runs the browser E2E suite per resolved company. Does NOT modify the QA task — only screenshots are published back via publish_e2e_evidence. Skips intake/spec/qa-test-plan generation: the QA task IS the source of truth.
- `/axiom-ibk-e2e-tests` — Dedicated workflow to execute the IBK E2E suite starting from a Work Item. Generates the QA Test Plan from the AC, executes via cursor-ide-browser and publishes evidence (screenshots) to the ADO [QA] task. Does NOT change production code: produces only test artifacts and reports. Reference: `core/references/sdd/pipeline/03.5-qa-test-plan.md`.
- `/axiom-platform-task` — ADO-driven pipeline for the Platform team — handles features, bugs, refactors and infra tasks across Express.js microservices using Clean Architecture (tsyringe + TypeORM + Jest + npm). Includes cross-service contract verification for party-service and authorization-domain.
- `/axiom-sdd-feature-dev` — Quality-First feature pipeline. Forces a Specification phase
- `/axiom-sdd-full` — Spec-Driven Development — full pipeline from constitution intake through specification, review, task decomposition, implementation, verification, and AC traceability.
- `/axiom-sdd-spec-execute` — Reads a specification from the specs repository and implements it in the target repository.
- `/axiom-snyk-fix` — Multi-agent Snyk vulnerability fix pipeline — audit, triage, deep analysis (opus), dual expert review, implementation, PR review loop, ADO update
- `/axiom-standard` — Default workflow — planning, implementation, testing, and review
- `/axiom-unit-test` — Test generation pipeline — analyze, strategy, create tests, compile, run, report

### Knowledge Protocol

Before any task, follow the 3-Tier knowledge protocol:

1. **Tier 1 (ALWAYS first)**: Load `axiom-plugin/knowledge/_quick-reference.md`
2. **Tier 2 (RAG search)**: Use MCP tools — `mcp__project-knowledge__search_knowledge({"query": "<terms>", "top_k": 5})`, `mcp__project-knowledge__get_section({"file": "<path>", "heading": "<section>"})`, `mcp__project-knowledge__list_features` (no arguments)
3. **Tier 3 (Fallback)**: Full file read only when Tier 2 is insufficient

### MCP Tools

Configured in `axiom-plugin/.mcp.json`:

- **project-knowledge** — Hybrid BM25 + TF-IDF search across project knowledge and documentation
- **work-item-images** — Image context extraction for work items and visual references

### Skills

Available in `axiom-plugin/skills/`: `a11y-corporate-lifecycle-governance`, `axiom-auto-fix`, `axiom-auto-fix-v2`, `axiom-bff-implement`, `axiom-bug-fix`, `axiom-compound`, `axiom-cost-analysis`, `axiom-datadog-monitor-create`, `axiom-doc-gen`, `axiom-feature-dev`, `axiom-ibk-e2e-from-qa-task`, `axiom-ibk-e2e-tests`, `axiom-ibk-frontend-feature`, `axiom-ibk-frontend-microfix`, `axiom-platform-task`, `axiom-sdd-backend`, `axiom-sdd-bff-implement`, `axiom-sdd-feature-dev`, `axiom-sdd-full`, `axiom-sdd-spec-execute`, `axiom-snyk-fix`, `axiom-standard`, `axiom-unit-test`, `bug-analysis-ado`, `bug-fix-workflow`, `cognitive-load-guardrails`, `context-budget`, `create-env`, `create-gateway`, `create-integration-test`, `create-repository`, `create-route`, `create-unit-test`, `create-usecase`, `desktop-release-publish`, `dual-agent-review`, `frontend-visual-bug-refinement`, `pr-creator-ado`, `pr-final-validation-gate`, `release-notify-teams`, `sdd-css-audit`, `sdd-design`, `sdd-implement`, `sdd-intake`, `sdd-pipeline`, `sdd-qa-test-plan`, `sdd-review`, `sdd-spec`, `sdd-test-first`, `secure-coding`, `senior-code-reviewer`, `setup-errors`, `setup-logs`, `snyk-vulnerability-management`

## Project Documentation

Native project documentation is available in `docs/`:

- `docs/architecture.md`
- `docs/runtime.md` — Phase 4 runtime architecture (event-driven loop, managers, state)
- `docs/backend.md`
- `docs/config.md`
- `docs/database.md`
- `docs/domain.md`
- `docs/frontend.md`
- `docs/implementation.md`
- `docs/interfaces.md`
- `docs/security.md`

## CSS Build Protection (CRITICAL)

**The webview CSS build is protected against corruption. These rules are MANDATORY.**

### Workflow (DO NOT BREAK)

```bash
# 1. Tailwind CLI processes main.css
tailwindcss -i src/webview/main.css -o dist/webview.css --minify
# → Generates 17KB CSS with Tailwind utilities + xterm styles

# 2. esbuild bundles ONLY JavaScript
node esbuild.config.js --production
# → Processes .tsx/.ts files ONLY
# → Does NOT touch dist/webview.css

# 3. Validation runs automatically
node scripts/validate-css.js
# → Verifies CSS size >= 10KB
# → Verifies Tailwind classes present
# → Fails build if CSS corrupted
```

### RULES (NEVER VIOLATE)

❌ **FORBIDDEN:**
- Importing CSS in React components (`.tsx` files)
- Adding CSS loader to `esbuild.config.js`
- Adding `external: ['*.css']` to esbuild config
- Modifying `dist/webview.css` manually

✅ **ALLOWED:**
- `@import` CSS libraries in `src/webview/main.css`
- Tailwind directives in `main.css`
- Inline styles in React (emergency only)

### Validation

Every build automatically runs `pnpm run validate:css`:
- Checks CSS file size (must be >= 10KB)
- Verifies Tailwind classes exist
- Detects unprocessed `@tailwind` directives
- **Fails build if CSS corrupted**

Manual validation:
```bash
pnpm run validate:css
```

### If CSS Breaks

1. Check `dist/webview.css` size: `ls -lh dist/webview.css` (should be ~17KB)
2. Run validation: `pnpm run validate:css`
3. If validation fails, review recent changes to:
   - `src/webview/main.css`
   - `esbuild.config.js`
   - React component imports

**DO NOT** attempt to "fix" by adding CSS imports or loaders. This will make it worse.

## Domain Rules

See `.claude/rules/` for detailed coding standards, testing patterns, and architecture guidelines specific to this project's stack.
