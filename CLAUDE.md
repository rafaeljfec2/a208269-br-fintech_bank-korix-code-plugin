# Project: a208269-br-fintech_bank-korix-code-plugin

AI-native coding runtime agentic - um assistente de código inteligente, rápido e controlável integrado ao VSCode

Managed by Axiom Agents. Stack: typescript/react.

## Behavioral Guidelines

Guidelines to reduce common LLM coding mistakes. Adapted from
[andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md).
Apply together with the project-specific sections below.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Stack

- **Language**: typescript
- **Framework**: react
- **Package Manager**: pnpm
- **Build Tool**: tsc
- **Test Runner**: vitest
- **Lint Tool**: eslint

## Commands

```bash
pnpm run lint  # eslint src --ext ts,tsx
pnpm run test  # vitest run
pnpm run format  # prettier --write "src/**/*.ts"
```

## Project Structure

```
docs/
  features/
packages/
  context-compiler/
scripts/
src/
  __tests__/
  context/
  core/
  di/
  harness/
  modes/
  patch/
  prompts/
  providers/
  shared/
```

## Code Conventions

- Use `??` (nullish coalescing) — NEVER `||` for default values
- NEVER use `any` type anywhere
- Mark all interface/type properties as `readonly`
- Keep files under 800 lines — refactor if approaching limit
- Frontend components: mobile-first, `readonly` props
- Conditional rendering: ternary with `null` — NEVER `&&`
- Test descriptions in English

## Anti-patterns — NEVER do this

### TypeScript
- `||` for defaults → use `??`
- `as any` anywhere → type it properly
- `catch (e: any)` → use `catch (e: unknown)`
- Deep relative `../../../../` from apps → use package aliases

### Frontend
- `&&` for conditional rendering → use ternary with `null`
- JWT in `localStorage` → httpOnly cookies only
- `dangerouslySetInnerHTML` without sanitization → use DOMPurify

- **ESLint config:** `eslint.config.js`

## Monorepo

This is a monorepo with the following workspaces:

- `packages/*`

### Workspace packages:

- packages/ (context-compiler)

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
- `/axiom-ibk-frontend-feature` — Spec-Driven Development pipeline for IBK Internet Banking frontend features. Combines vision-driven analysis (Figma/design images → IBK design system matching → RTK Query services → component implementation) with the full SDD pipeline (intake → spec → review [8 categories + 19 HARD RULES] → QA test plan → design → CSS layer map → TDD red phase → implementation → green phase → CSS audit → verification → AC traceability → PR). BFF endpoints are defined as contracts but implemented separately. Reference: `core/references/sdd/pipeline/00-overview.md` for the full pipeline description.
- `/axiom-ibk-frontend-microfix` — Lean preset of /axiom-sdd-full for XS/S frontend tasks in the IBK Internet Banking monorepo. Reuses all canonical SDD agents (intake, analyzer, spec-writer, test-writer, implementer) and templates. Adds three workflow-local conventions PENDING constitution approval (HR-20 Micro-Detail Pass, HR-21 Pre-PR Triple-Visual MANDATORY, HR-22 Quality Gates Parallel). Skips CSS Layer Mapping, CSS Audit, Vision Review (second opinion) and the separate Senior Code Review (consolidated into a single final gate). 8 active phases targeting ~80 minutes for tasks within the eligibility envelope (≤ 30 LOC, 0 new components / endpoints / stores / pages / CSS files). REDIRECTs to /axiom-ibk-frontend-feature when scope grows and to /axiom-auto-fix-ibk for known visual divergences. Reference: `.claude/skills/axiom-ibk-frontend-microfix/SKILL.md`.
- `/axiom-platform-task` — ADO-driven pipeline for the Platform team — handles features, bugs, refactors and infra tasks across Express.js microservices using Clean Architecture (tsyringe + TypeORM + Jest + npm). Includes cross-service contract verification for party-service and authorization-domain.
- `/axiom-refinamento` — Refinamento multiagente (16 papéis) + análise de coerência com épico de referência + export Markdown. Inicia por sync de repositório, ADO e knowledge base; não inclui implementação nem commit de código de produto.
- `/axiom-release-notes-deploy` — Gera dois Release Notes (Funcional + Técnico, PT-BR) a partir de uma US de Deploy do Azure DevOps e suas demandas vinculadas. Não usa Iteration/Sprint/Time — a seleção do conteúdo vem da US de Deploy.
- `/axiom-sdd-feature-dev` — Quality-First feature pipeline. Forces a Specification phase
- `/axiom-sdd-full` — Spec-Driven Development — full pipeline from constitution intake through specification, review, task decomposition, implementation, verification, and AC traceability.
- `/axiom-sdd-spec-execute` — Reads a specification from the specs repository and implements it in the target repository.
- `/axiom-sdd-spec-ideation` — Interactive spec generation workflow for stakeholder meetings (Tech Lead, Delivery Manager,
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

### Visual References Protocol

When a work item has images (Figma screens, UI mockups, screenshots):

1. Call `mcp__work-item-images__list_work_item_images({"work_item_id": <WI_ID>})` to sync + list images
2. Use the **Read tool** on EACH image — extract every UI component (buttons, badges, inputs, tables, spacing, colors)
3. For **FIX tasks**: identify which image is CURRENT (wrong) and which is FIGMA (correct)
   - Extract components from BOTH images
   - Compare component by component — note every difference (color, spacing, border-radius, text, variant)
   - Map each difference to the exact file and CSS property in the repo
4. Every implementation MUST be faithful to the Figma — compare component by component before coding

The Figma image is the ABSOLUTE source of truth — never guess, never skip image analysis.

### ⛔ HARD RULES — Visual Implementation (BLOCKING for ALL UI tasks)

These rules are NON-NEGOTIABLE. Violating any rule is a FATAL workflow error
that invalidates the entire execution. You MUST follow them before writing code.

**RULE 1 — Icon Color: MUST Investigate Render Method + SVG Source + Variants**
Before changing ANY icon color, you MUST investigate THREE things:

  Step A: HOW does the Icon component render SVGs?
    - `<img src="...">` → CSS `color` has ZERO effect (completely isolated)
    - inline `<svg>` → CSS works IF fill="currentColor"
    - React SVG component → CSS works via currentColor

  Step B: Read the actual SVG file — what are the fill/stroke values?
    - hardcoded `fill="#666"` means CSS cannot change it
    - `fill="currentColor"` means CSS can change it

  Step C: Search for existing COLOR VARIANTS in the design system:
    - `ls src/assets/icons/*iconName*` or `grep -r "iconName" --include="*.svg"`
    - If a variant with the correct color already exists (e.g. `copyOrange`),
      the fix is just changing the icon name prop — a 1-line change!

⛔ Applying CSS `color` when the Icon renders via `<img>` is FORBIDDEN (it has no effect).
⛔ Not searching for existing color variants before creating new SVGs is FORBIDDEN.
⛔ Printing "N/A" for SVG source without actually reading it is FORBIDDEN.

**RULE 2 — Structural Components: MUST Decompose ALL Sub-Elements**
When implementing a badge, tag, chip, or status indicator from Figma:
  1. Re-read the Figma reference image for this specific component
  2. List EVERY visible sub-element: internal icon, text, background, border, radius
  3. Implement ALL of them — missing ANY sub-element is a FATAL error
⛔ A badge with a checkmark in Figma MUST have a checkmark in code.
⛔ Implementing only text+background while ignoring an icon is FORBIDDEN.

**RULE 3 — Element Order: MUST Match Figma Exactly (Visibility ≠ Position)**
When Figma shows elements in a specific left-to-right or top-to-bottom order,
your JSX render order MUST match that exact sequence. Read the current JSX,
compare with Figma, and reorder if needed.
⛔ Rendering a filter chip AFTER the filter button when Figma shows it BEFORE is FORBIDDEN.
⛔ CRITICAL: Visibility and Position are TWO separate problems.
  Making an element visible (fixing data/logic) does NOT fix its position.
  You MUST also verify the JSX render order matches Figma after the element is visible.
⛔ Concluding 'structure is correct' when JSX order differs from Figma is FORBIDDEN.

**RULE 4 — i18n Multi-Locale: ALL 3 Locales Required**
3 mandatory locales: pt-BR.json, en-US.json, es-ES.json.
⛔ Updating only pt-BR.json is FORBIDDEN. All 3 MUST be updated for EVERY text change.

**RULE 5 — No Shortcuts, No Deferrals Without Justification**
⛔ Deferring an item that was explicitly listed in the work item description is FORBIDDEN
   unless you provide a concrete technical justification (not budget).
⛔ Claiming "already correct" without showing file:line evidence is FORBIDDEN.

**RULE 6 — Always Implement From Scratch on Your Branch**
Your branch was created from a clean `develop`. Previous fix branches (v2, v3, v4, etc.)
are NOT merged into develop. Their changes DO NOT EXIST on your branch.
⛔ Claiming "already fixed in vN" or "already done" is WRONG — vN is not on your branch.
⛔ You MUST implement EVERY divergence from scratch. Read the actual code on YOUR branch.
⛔ Before starting implementation, run `git log --oneline -3` to confirm you branched from develop HEAD.

### Skills

Available in `axiom-plugin/skills/`: `a11y-corporate-lifecycle-governance`, `axiom-auto-fix`, `axiom-auto-fix-v2`, `axiom-bff-implement`, `axiom-bug-fix`, `axiom-compound`, `axiom-cost-analysis`, `axiom-datadog-monitor-create`, `axiom-doc-gen`, `axiom-feature-dev`, `axiom-ibk-e2e-from-qa-task`, `axiom-ibk-e2e-tests`, `axiom-ibk-frontend-feature`, `axiom-ibk-frontend-microfix`, `axiom-platform-task`, `axiom-refinamento`, `axiom-release-notes-deploy`, `axiom-sdd-backend`, `axiom-sdd-bff-implement`, `axiom-sdd-feature-dev`, `axiom-sdd-full`, `axiom-sdd-spec-execute`, `axiom-sdd-spec-ideation`, `axiom-snyk-fix`, `axiom-sprint-planning-baseline`, `axiom-sprint-planning-rules`, `axiom-standard`, `axiom-unit-test`, `bug-analysis-ado`, `bug-fix-workflow`, `cognitive-load-guardrails`, `context-budget`, `create-env`, `create-gateway`, `create-integration-test`, `create-repository`, `create-route`, `create-unit-test`, `create-usecase`, `desktop-release-publish`, `dual-agent-review`, `frontend-visual-bug-refinement`, `korix-sdd`, `pr-creator-ado`, `pr-final-validation-gate`, `release-notify-teams`, `sdd-css-audit`, `sdd-design`, `sdd-implement`, `sdd-intake`, `sdd-pipeline`, `sdd-qa-test-plan`, `sdd-review`, `sdd-spec`, `sdd-test-first`, `secure-coding`, `senior-code-reviewer`, `setup-errors`, `setup-logs`, `snyk-vulnerability-management`, `spec-dev`

## Project Documentation

Native project documentation is available in `docs/`:

- `docs/architecture.md`
- `docs/backend.md`
- `docs/config.md`
- `docs/css-build.md`
- `docs/database.md`
- `docs/domain.md`
- `docs/frontend.md`
- `docs/implementation.md`
- `docs/interfaces.md`
- `docs/korix-context-compiler-roadmap.md`
- `docs/korix-ui-feedback-analysis.md`
- `docs/litellm_provider_used.md`
- `docs/performance.md`
- `docs/runtime.md`
- `docs/security.md`
- `docs/subagent-cancellation-propagation-audit.md`
- `docs/subagents.md`
- `docs/terminal-session-cleanup-audit.md`
- `docs/testing_litellm.md`
- `docs/testing-guide.md`
- `docs/testing-user-questions.md`
- `docs/tools_architecture.md`
- `docs/tools-api.md`
- `docs/tools-comparison.md`
- `docs/tools-roadmap-tasks.md`
- `docs/tools-roadmap.md`
- `docs/user-questions-example.md`

## Domain Rules

See `.claude/rules/` for detailed coding standards, testing patterns, and architecture guidelines specific to this project's stack.
