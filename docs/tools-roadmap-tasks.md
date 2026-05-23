# Tools Roadmap — Task Breakdown

**Data**: 2026-05-19

**Última revisão**: 2026-05-22

**Versão**: 1.2

Este documento quebra cada fase do roadmap em subtasks executáveis e rastreáveis. A versão 1.2 reconcilia o backlog com o estado real já implementado no repositório.

---

## 📊 Overview de Fases

| Fase | Items | Subtasks | Horas Total | Status |
|------|-------|----------|-------------|--------|
| **Fase 0** | 1 | 8 | 2h | ✅ Concluído |
| **Fase 1 (P0)** | DeleteFile + Await | TBD | 24h | ✅ Concluído |
| **Fase 2 (P0)** | Task/Subagents MVP | TBD | 32h | ✅ Concluído e expandido |
| **Fase 3 (P1)** | ReadFile images + Glob | TBD | 28h | ✅ Concluído |
| **Fase 4 (P2)** | WebFetch + TodoWrite + hardening inicial | TBD | TBD | ✅ Concluído |
| **Fase 5 (P0)** | Resource limits + cancellation hardening | TBD | TBD | ✅ Concluído |
| **Fase 6 (P1)** | Subagent progress + pooling + recovery | TBD | TBD | ✅ Concluído |
| **Fase 7 (P1)** | State serialization + resource monitoring | TBD | TBD | ✅ Concluído |
| **Fase 8 (P1)** | Parent-to-child state wiring | TBD | TBD | ✅ Concluído |
| **Backlog** | CPU hard limits, replay/debug UI | TBD | TBD | ⚪ Backlog |

---

## Estado Reconciliado — 2026-05-22

### Entregas Confirmadas

- [x] `DeleteFile` seguro.
- [x] `RunCommand` com background mode.
- [x] `Await` para polling de comandos em background.
- [x] `ReadFile` com metadados de imagem.
- [x] `Glob` coexistindo com `SearchFiles`.
- [x] `WebFetch` com limites de segurança.
- [x] `TodoWrite` registrado como tool.
- [x] `Task` tool.
- [x] subagent `explore`.
- [x] subagent `plan`.
- [x] subagent `review`.
- [x] subagent `shell`.
- [x] subagent `test`.
- [x] métricas básicas de `SubagentRunner`.
- [x] documentação de subagents.
- [x] enforcement de `SubagentConfig.maxIterations`.
- [x] enforcement de `SubagentConfig.timeout`.
- [x] propagação de `AbortSignal` do runtime para providers.
- [x] propagação de `AbortSignal` do runtime para tools via `ToolContext`.
- [x] adoção cooperativa de `ToolContext.signal` em `WebFetch` e `Await`.
- [x] auditoria de cleanup de terminal/background sessions.
- [x] `TerminateSession` explícita e approval-aware para sessões de terminal.
- [x] micro-deliberação do modelo para perguntar mudança de modo antes do fluxo principal no webview.

### Commits de Referência

- `8e13133 feat: add safe delete file tool`
- `f1f9288 feat: add background terminal await tool`
- `950c999 feat: add explore subagent task tool`
- `60cef26 feat: add image metadata reads`
- `3947c15 feat: add glob file matching tool`
- `58a74e4 feat: add safe web fetch tool`
- `9382f4b feat: add runtime todo write tool`
- `37de229 feat: add plan subagent task type`
- `c568954 feat: add review subagent task type`
- `59fedb5 feat: add shell subagent task type`
- `1a9d471 feat: add test subagent task type`
- `dae36b9 feat: add subagent runner metrics`
- `962070c docs: add subagents guide`
- `29a0d08 feat: enforce subagent max iterations`
- `9f44d2e feat: enforce subagent timeout`

### Próxima Fase Executável

## FASE 5: Subagent Resource Limits & Cancellation Hardening (P0)

**Objetivo**: transformar o sistema de subagents de "funcional" para "confiável sob falha".

## 5.1 Resource Limits Contract

**Prioridade**: 🔴 P0

**Dependências**: subagents, métricas, timeout e maxIterations já implementados.

### Subtasks

#### Task 5.1.1: SDD Intake & Spec
- [x] Criar `.sdd/subagent-resource-limits/intake.md`
- [x] Criar `.sdd/subagent-resource-limits/spec.md`
- [x] Definir ACs para limite de tool calls, output agregado e metadata de parada.
- [x] Definir explicitamente fora do escopo: pooling, streaming e retry avançado.

#### Task 5.1.2: TDD Red
- [x] Red test: subagent falha quando excede máximo de tool calls.
- [x] Red test: subagent falha quando excede máximo de output agregado.
- [x] Red test: subagent normal não é afetado pelos limites.
- [x] Red test: timeout/cancel reason aparece em metadata quando aplicável.

#### Task 5.1.3: Contract & Types
- [x] Adicionar tipo `SubagentResourceLimits`.
- [x] Adicionar `resourceLimits` em `SubagentConfig`.
- [x] Adicionar metadata estruturada no `SubagentResult`.
- [x] Preservar readonly properties.

#### Task 5.1.4: Enforcement
- [x] Aplicar limite de tool calls no final do child run usando `toolCallHistory`.
- [x] Aplicar limite de output usando conteúdo final + tool outputs quando disponível.
- [x] Retornar falha estruturada sem lançar erro desnecessário.
- [x] Manter comportamento atual para runs dentro dos limites.

#### Task 5.1.5: Verification
- [x] Rodar testes focados de subagent.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Rodar `git diff --check`.
- [x] Rodar architecture gate e registrar violações preexistentes.

**Status**: ✅ Implementado.

**Critério de aceitação**: subagents têm limites operacionais explícitos, testados e visíveis em resultado/metadata, sem alterar ferramentas individuais.

## 5.2 Cancellation Propagation Audit

**Prioridade**: 🟡 P1

**Dependências**: 5.1.

### Subtasks

- [x] Mapear onde `CancellationManager.cancel()` é chamado.
- [x] Mapear quais tools/providers observam cancelamento.
- [x] Criar relatório curto em `.sdd/subagent-cancellation-audit/`.
- [x] Definir se a próxima implementação deve ser provider abort, tool abort ou apenas metadata/eventos.

**Status**: ✅ Implementado em `docs/subagent-cancellation-propagation-audit.md`.

**Decisão**: próxima implementação deve ser `5.3 Provider Abort Propagation`.

**Critério de aceitação**: decisão técnica documentada antes de qualquer refactor de cancellation.

## 5.3 Provider Abort Propagation

**Prioridade**: 🔴 P0

**Dependências**: 5.2.

### Subtasks

- [x] Criar `.sdd/provider-abort-propagation/intake.md`.
- [x] Criar `.sdd/provider-abort-propagation/spec.md`.
- [x] Red test: provider recebe `RequestContext.signal`.
- [x] Red test: signal fica `aborted` quando `AgentLoop` timeout dispara.
- [x] Passar `CancellationManager.getSignal()` para `RequestContext.signal`.
- [x] Rodar testes focados de runtime/provider.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Rodar `git diff --check`.
- [x] Rodar architecture gate e registrar violações preexistentes.

**Critério de aceitação**: requests de provider observam cancelamento do runtime sem alterar contratos de tools.

**Status**: ✅ Implementado.

**Evidência**:

- `src/core/runtime/executionEngine.cancellation.test.ts`
- `src/core/runtime/executionEngine.ts`
- `.sdd/provider-abort-propagation/ac-coverage.md`

## 5.4 Tool Context Signal Propagation

**Prioridade**: 🔴 P0

**Dependências**: 5.3.

### Subtasks

- [x] Criar `.sdd/tool-context-signal-propagation/intake.md`.
- [x] Criar `.sdd/tool-context-signal-propagation/spec.md`.
- [x] Red test: runtime/scheduler passa um `AbortSignal` para tool execution context.
- [x] Red test: signal fica `aborted` quando `AgentLoop` timeout dispara durante execução de tool.
- [x] Estender `ToolContext` com `readonly signal?: AbortSignal` mantendo compatibilidade.
- [x] Propagar o signal no executor usado por `ToolScheduler`.
- [x] Rodar testes focados de runtime/tool scheduler.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Rodar `git diff --check`.
- [x] Rodar architecture gate e registrar violações preexistentes.

**Critério de aceitação**: tools passam a poder observar cancelamento do runtime sem exigir alteração imediata em cada tool individual.

**Status**: ✅ Implementado.

**Evidência**:

- `src/core/runtime/executionEngine.toolCancellation.test.ts`
- `src/core/runtime/executionEngine.ts`
- `src/harness/toolRegistry.ts`
- `.sdd/tool-context-signal-propagation/ac-coverage.md`

## 5.5 Signal-Aware Tool Adoption

**Prioridade**: 🔴 P0

**Dependências**: 5.4.

### Subtasks

- [x] Criar `.sdd/signal-aware-tool-adoption/intake.md`.
- [x] Criar `.sdd/signal-aware-tool-adoption/spec.md`.
- [x] Red test: `WebFetch` aborta quando `context.signal` aborta.
- [x] Red test: polling/await-style tool para de aguardar quando `context.signal` aborta.
- [x] Implementar merge entre timeout local e `context.signal` em `WebFetch`.
- [x] Implementar observação de `context.signal` em `Await`/polling sem quebrar timeout atual.
- [x] Manter terminal process cleanup fora desta fatia.
- [x] Rodar testes focados de tools.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Rodar `git diff --check`.
- [x] Rodar architecture gate e registrar violações preexistentes.

**Critério de aceitação**: pelo menos as tools long-running de menor risco consomem `ToolContext.signal` de forma cooperativa e preservam seus timeouts próprios.

**Status**: ✅ Implementado.

**Evidência**:

- `src/tools/web/webFetch.test.ts`
- `src/tools/terminalAwait.test.ts`
- `src/tools/web/webFetch.ts`
- `src/tools/terminalAwait.ts`

## 5.6 Terminal Session Cleanup Audit

**Prioridade**: 🟡 P1

**Dependências**: 5.5.

### Subtasks

- [x] Criar `.sdd/terminal-session-cleanup-audit/intake.md`.
- [x] Mapear ciclo de vida de background sessions no `CommandRunner`.
- [x] Verificar se timeout/cancelamento deve apenas parar polling ou também encerrar processo.
- [x] Definir riscos de kill automático para comandos de usuário.
- [x] Produzir decisão técnica antes de qualquer implementação de cleanup agressivo.

**Critério de aceitação**: decisão documentada sobre cleanup de sessões de terminal antes de alterar comportamento destrutivo ou encerrar processos automaticamente.

**Status**: ✅ Implementado em `docs/terminal-session-cleanup-audit.md`.

**Decisão**: não matar sessões automaticamente quando `Await` ou o agente forem cancelados. A próxima implementação deve ser uma terminação explícita, approval-aware e limitada ao modo `agent`.

## 5.7 Explicit Terminal Session Termination

**Prioridade**: 🟡 P1

**Dependências**: 5.6.

### Subtasks

- [x] Criar `.sdd/terminal-session-termination/intake.md`.
- [x] Criar `.sdd/terminal-session-termination/spec.md`.
- [x] Red test: terminar sessão existente chama `TerminalSessionManager.killSession`.
- [x] Red test: sessão desconhecida retorna falha estruturada.
- [x] Red test: tool só fica disponível em `agent`.
- [x] Red test: tool exige aprovação.
- [x] Implementar tool explícita `TerminateSession`.
- [x] Registrar tool em `src/tools/index.ts`.
- [x] Rodar testes focados.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Atualizar roadmap ao final da fase.

**Critério de aceitação**: Korix consegue encerrar uma sessão/background work de forma explícita e auditável, sem cleanup implícito em cancelamentos.

**Status**: ✅ Implementado.

**Evidência**:

- `src/tools/terminalTerminate.ts`
- `src/tools/terminalTerminate.test.ts`
- `src/terminal/commandRunner.ts`
- `src/terminal/commandRunner.test.ts`

## 5.8 Parent-to-Subagent Cancellation Link

**Prioridade**: 🟡 P1

**Dependências**: 5.7.

### Subtasks

- [x] Criar `.sdd/parent-subagent-cancellation-link/intake.md`.
- [x] Mapear onde subagents criam `AgentLoop`/`CancellationManager` próprios.
- [x] Red test: cancelamento do parent cancela subagent em execução.
- [x] Implementar propagação sem compartilhar estado mutável indevido.
- [x] Registrar metadata de cancelamento no `SubagentResult`.
- [x] Rodar testes focados.
- [x] Rodar `pnpm run lint`.
- [x] Rodar `pnpm run test`.
- [x] Atualizar roadmap.

**Critério de aceitação**: cancelamento do agente pai interrompe subagents filhos de forma explícita e rastreável, sem afetar sessões de terminal por efeito colateral.

**Status**: ✅ Implementado.

**Evidência**:

- `src/tools/task.test.ts`
- `src/core/subagent/subagentRunner.test.ts`
- `src/tools/task.ts`
- `src/core/subagent/subagentRunner.ts`
- `src/core/subagent/subagentTypes.ts`
- `src/core/runtime/agentLoop.ts`

## FASE 6: Subagent Progress & Performance (P1)

**Objetivo**: melhorar observabilidade, custo de execução e resiliência básica dos subagents sem alterar o contrato de tools individuais.

## 6.1 Subagent Result Streaming / Progress Events

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Definir `SubagentProgressEvent`.
- [x] Adicionar callback opcional `SubagentRequest.onEvent`.
- [x] Encaminhar eventos `iteration_start`, `tool_call` e `iteration_complete`.
- [x] Preservar runs existentes sem callback.
- [x] Cobrir com teste focado.

**Critério de aceitação**: o parent consegue observar progresso relevante do subagent sem acoplar diretamente o child `AgentLoop`.

## 6.2 Subagent Registry Pooling

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Adicionar pool LRU interno de registries por tipo de subagent.
- [x] Limitar pool a 5 entradas.
- [x] Reutilizar registry em runs repetidos do mesmo tipo.
- [x] Não compartilhar `AgentLoop`, `RuntimeState` ou `CancellationManager`.
- [x] Cobrir com teste focado.

**Critério de aceitação**: runs repetidos evitam recriação desnecessária de registry mantendo isolamento de runtime.

## 6.3 Basic Subagent Recovery

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Implementar retry único para erro transitório.
- [x] Não retry para cancelamento ou resource limit.
- [x] Registrar `metadata.recoveryAttempts`.
- [x] Cobrir sucesso após retry e falha persistente.

**Critério de aceitação**: falhas transitórias conhecidas recebem uma segunda tentativa controlada e rastreável.

**Evidência**:

- `src/core/subagent/subagentRunner.phase6.test.ts`
- `src/core/subagent/subagentRunner.ts`
- `src/core/subagent/subagentTypes.ts`

## FASE 7: Subagent State & Resource Monitoring (P1)

**Objetivo**: tornar o estado do runtime serializável para futuras passagens parent-to-child e expor resource usage básico de subagents sem kill automático.

## 7.1 RuntimeState Serialization

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Adicionar tipos serializáveis para runtime, memory e workspace.
- [x] Converter `Map` para entries.
- [x] Converter `Set` para array.
- [x] Implementar `RuntimeState.serialize()`.
- [x] Implementar `RuntimeState.deserialize(snapshot)`.
- [x] Cobrir JSON round-trip e restauração com testes.

**Critério de aceitação**: `RuntimeState` pode produzir um snapshot JSON-safe e restaurar state equivalente para conversation, execution, workspace e memory simples.

## 7.2 Subagent Resource Monitoring

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Adicionar `SubagentResourceUsage`.
- [x] Registrar `durationMs`.
- [x] Registrar `heapUsedBytes`.
- [x] Expor `resourceUsage` em `SubagentResult.metadata`.
- [x] Não matar sessões/processos automaticamente.
- [x] Cobrir metadata com teste focado.

**Critério de aceitação**: cada resultado de subagent carrega uso básico de recursos para observabilidade, preservando limits e cancellation existentes.

**Evidência**:

- `src/core/runtime/runtimeState.test.ts`
- `src/core/runtime/runtimeState.ts`
- `src/core/runtime/runtimeTypes.ts`
- `src/core/subagent/subagentRunner.phase6.test.ts`
- `src/core/subagent/subagentRunner.ts`
- `src/core/subagent/subagentTypes.ts`

## FASE 8: Parent-to-Child State Wiring (P1)

**Objetivo**: conectar o snapshot serializado da Fase 7 ao fluxo de subagents, permitindo que o parent disponibilize estado estruturado ao child sem mutação compartilhada.

## 8.1 Parent State Snapshot Contract

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] Adicionar `getRuntimeStateSnapshot` ao `ToolContext`.
- [x] Adicionar `parentStateSnapshot` ao `SubagentRequest`.
- [x] Adicionar metadata `parentStateSnapshotReceived`.
- [x] Preservar compatibilidade para callers sem snapshot.

**Critério de aceitação**: tools podem obter uma cópia serializada do runtime parent e repassar ao subagent request.

## 8.2 Runtime Wiring

**Prioridade**: 🟡 P1

**Status**: ✅ Implementado.

### Subtasks

- [x] `ExecutionEngine.buildToolContext()` expõe `state.serialize()`.
- [x] `TaskTool` repassa `parentStateSnapshot`.
- [x] `SubagentRunner` registra se recebeu snapshot.
- [x] Testar que o snapshot é JSON-safe e não muta parent state.

**Critério de aceitação**: subagent recebe snapshot estruturado do parent de forma rastreável, sem restaurar automaticamente o child state nesta fase.

**Evidência**:

- `src/core/runtime/executionEngine.parentState.test.ts`
- `src/tools/task.test.ts`
- `src/core/subagent/subagentRunner.phase6.test.ts`
- `src/harness/toolRegistry.ts`
- `src/core/runtime/executionEngine.ts`
- `src/tools/task.ts`
- `src/core/subagent/subagentTypes.ts`
- `src/core/subagent/subagentRunner.ts`

## UX Guardrail: Model-Based Mode Switch Prompt

**Prioridade**: 🔴 P0

**Status**: ✅ Implementado; revisado para deliberação do modelo.

### Subtasks

- [x] Consultar o modelo com um prompt curto antes do fluxo principal em ASK/PLAN.
- [x] Usar sinais determinísticos apenas como contexto/fallback de segurança.
- [x] Recomendar PLAN para análise/read-only.
- [x] Recomendar AGENT para implementação/execução.
- [x] Perguntar antes de chamar o executor principal.
- [x] Atualizar o modo visual do webview quando o usuário aceita.
- [x] Recalcular contexto, perfil, policy e execution path depois da troca.
- [x] Não chamar o executor principal/tools quando o usuário decide permanecer no modo atual.

**Critério de aceitação**: Korix usa uma deliberação compacta do próprio modelo para decidir se precisa trocar para PLAN/AGENT, pede confirmação ao usuário e só então entra no fluxo principal.

---

# FASE 0: Roadmap Alignment (Pré-Implementação)

**Esforço Total**: 2 horas

**Status**: ✅ Concluído como preparação documental

**Objetivo**: Corrigir premissas antes da primeira implementação.

## Subtasks

### Task 0.1: Confirmar estado atual das tools
- [x] Verificar `src/tools/index.ts`
- [x] Confirmar total da época: 20 tools registradas
- [x] Confirmar ausências: `DeleteFile`, `Await`, `Task`, `Glob`, `WebFetch`, `TodoWrite`

### Task 0.2: Corrigir sequência de entrega
- [x] Definir `DeleteFile` como primeira implementação
- [x] Mover `TodoWrite` para backlog/decisão de produto
- [x] Definir `Task/Subagents` como MVP `explore` antes de sistema completo
- [x] Definir `Glob` como coexistente com `SearchFiles`
- [x] Definir `WebFetch` como P2 por risco de rede

### Task 0.3: Preparar TDD antes da primeira implementação
- [x] Registrar que cada fatia começa com testes Red
- [x] Corrigir segurança de `DeleteFile`: sem auto-approval por `force`
- [x] Corrigir validação de path: usar `path.resolve` + `path.relative`, não `startsWith`

**Critério de aceitação**: Roadmap alinhado e pronto para abrir a fatia SDD/TDD de `DeleteFile`, sem alterar código de runtime/tools.

---

## Marco de Parada Atual

Este documento foi reconciliado após a implementação do ciclo inicial de tools e subagents. As seções Fase 1-3 abaixo permanecem como histórico detalhado e não devem ser usadas como fonte primária de status. A próxima implementação deve começar pela Fase 5.

---

# FASE 1: Critical Gap Fixes (P0)

**Duração**: 2 semanas
**Esforço Total**: 24 horas
**Objetivo**: Entregar `DeleteFile` seguro e base de background terminal/Await.

---

## 1.1 DeleteFile Tool

**Esforço Total**: 4 horas
**Prioridade**: 🔴 P0
**Dependências**: Nenhuma

### Subtasks

#### Task 1.1.1: Setup & Schema (30min)
- [ ] Criar arquivo `src/tools/filesystem/deleteFile.ts`
- [ ] Importar dependências (vscode, path, zod, types)
- [ ] Definir `DeleteFileSchema` com Zod
  - `path: string`
  - `recursive?: boolean`
- [ ] Criar type `DeleteFileInput` com `z.infer`
- [ ] Criar skeleton da tool com name, description, schema

**Critério de aceitação**: Arquivo compila sem erros

---

#### Task 1.1.2: TDD Red — Security & Approval Tests (1h)
- [ ] Criar arquivo `src/tools/filesystem/deleteFile.test.ts`
- [ ] Escrever teste Red: "should delete file within workspace using trash"
- [ ] Escrever teste Red: "should block deletion outside workspace"
- [ ] Escrever teste Red: "should block sibling path with same prefix as workspace"
- [ ] Escrever teste Red: "should block deletion of .git directory"
- [ ] Escrever teste Red: "should block deletion of node_modules root"
- [ ] Escrever teste Red: "should require approval for every deletion"
- [ ] Rodar teste alvo e registrar falhas esperadas

**Critério de aceitação**: Testes falham por comportamento ausente, não por erro de setup.

---

#### Task 1.1.3: Security Validation (1h)
- [ ] Implementar função `isCriticalPath(absolutePath, workspaceRoot)`
  - [ ] Lista de paths críticos: `.git`, `package.json`, `tsconfig.json`, `node_modules`, `.env`, `.env.*`, `pnpm-lock.yaml`
  - [ ] Usar `path.relative` para detectar path igual ou descendente de critical path
- [ ] Adicionar validação de workspace bounds
  - [ ] Resolver `workspaceRoot` com `path.resolve`
  - [ ] Resolver `absolutePath` com `path.resolve(workspaceRoot, input.path)`
  - [ ] Verificar se `path.relative(workspaceRoot, absolutePath)` começa com `..` ou é absoluto
  - [ ] Retornar erro se fora do workspace

**Critério de aceitação**: Funções utilitárias testáveis isoladamente

---

#### Task 1.1.4: Core Execute Logic (1h)
- [ ] Implementar método `execute()`
  - [ ] Normalizar path (absoluto vs relativo)
  - [ ] Validar workspace bounds (usar validação de 1.1.3)
  - [ ] Validar critical paths (usar validação de 1.1.3)
  - [ ] Criar `vscode.Uri.file(absolutePath)`
  - [ ] Verificar se path existe (`vscode.workspace.fs.stat`)
  - [ ] Chamar `vscode.workspace.fs.delete(uri, { recursive, useTrash: true })`
  - [ ] Retornar `ToolResult` com success/error
- [ ] Implementar `allowedInMode()` — apenas `agent`
- [ ] Implementar `requiresApproval()` — sempre `true`

**Critério de aceitação**: Tool executa delete com validações

---

#### Task 1.1.5: Green Tests & Regression (45min)
- [ ] Rodar `pnpm test deleteFile.test.ts`
- [ ] Confirmar que todos os testes Red viraram Green sem enfraquecer assertions
- [ ] Adicionar teste de `allowedInMode`: bloqueia `ask` e `plan`, permite `agent`
- [ ] Rodar testes: `pnpm test deleteFile.test.ts`

**Critério de aceitação**: 6+ testes passando

---

#### Task 1.1.6: Integration & Registration (30min)
- [ ] Exportar `DeleteFileTool` em `src/tools/filesystem/deleteFile.ts`
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas (linha ~31)
- [ ] Adicionar `DeleteFile` ao array `writeTools` em `toolRegistry.ts` (linha ~343)
- [ ] Rodar `pnpm run lint`
- [ ] Rodar `pnpm test` (all tests)
- [ ] Testar manualmente via provider call (opcional)

**Critério de aceitação**: Tool registrada, todos testes passando

---

#### Task 1.1.7: Documentation (15min)
- [ ] Adicionar JSDoc ao `DeleteFileTool`
- [ ] Documentar security policies no description
- [ ] Adicionar exemplo de uso no description
- [ ] Atualizar `docs/tools-api.md` com DeleteFile entry (se existir)
- [ ] Commit: `feat: add DeleteFile tool with security validation`

**Critério de aceitação**: Documentação completa e commit criado

---

## 1.2 TodoWrite Tool Registration

**Esforço Total**: 2 horas
**Prioridade**: 🔴 P0
**Dependências**: RuntimeState precisa expor método público

### Subtasks

#### Task 1.2.1: Create Tool Wrapper (30min)
- [ ] Criar arquivo `src/tools/todoWrite.ts`
- [ ] Importar dependências (zod, types)
- [ ] Definir `TodoSchema`
  - `content: string (min 1)`
  - `status: enum(["pending", "in_progress", "completed"])`
  - `activeForm: string (min 1)`
- [ ] Definir `TodoWriteSchema`
  - `todos: array(TodoSchema).min(1)`
- [ ] Criar types com `z.infer`
- [ ] Criar interface `TodoWriteOutput`
  - `updatedCount: number`
  - `todos: Array<...>`
- [ ] Criar skeleton da tool

**Critério de aceitação**: Schema definido, compila sem erros

---

#### Task 1.2.2: Validation Logic (30min)
- [ ] Implementar validação "only one in_progress"
  - [ ] Filter `input.todos` por `status === "in_progress"`
  - [ ] Se `inProgress.length > 1`, retornar erro
- [ ] Criar mensagem de erro descritiva
- [ ] Adicionar description detalhado na tool
  - [ ] Explicar regras (one in_progress, complete immediately)
  - [ ] Adicionar exemplo JSON

**Critério de aceitação**: Validação implementada

---

#### Task 1.2.3: RuntimeState Integration (45min)
- [ ] Modificar `src/core/runtime/runtimeState.ts`
- [ ] Adicionar método público `updateTodos(todos: Array<...>): void`
  - [ ] Validar "only one in_progress" (duplicar lógica da tool)
  - [ ] Atualizar `this.conversationState.todos`
  - [ ] Emitir evento `todos_updated`
- [ ] Adicionar método público `getTodos(): Array<...>`
  - [ ] Retornar `this.conversationState.todos ?? []`
- [ ] Adicionar tipo do evento em `src/core/runtime/runtimeEvents.ts`
  - [ ] `type: "todos_updated"`
  - [ ] `data: { todos: Array<...> }`

**Critério de aceitação**: RuntimeState expõe métodos públicos

---

#### Task 1.2.4: Execute Implementation (15min)
- [ ] Implementar `TodoWriteTool.execute()`
- [ ] Validar input (chamar lógica de 1.2.2)
- [ ] Obter RuntimeState do context
- [ ] Chamar `runtimeState.updateTodos(input.todos)`
- [ ] Criar output: `{ updatedCount, todos }`
- [ ] Retornar `ToolResult` com success
- [ ] Implementar `allowedInMode()` — `true` (todos os modos)

**Critério de aceitação**: Execute funcional

---

#### Task 1.2.5: Unit Tests (30min)
- [ ] Criar arquivo `src/tools/todoWrite.test.ts`
- [ ] Teste: "should update todos successfully"
  - Input: 3 todos (1 completed, 1 in_progress, 1 pending)
  - Assert: `result.success === true`, `updatedCount === 3`
- [ ] Teste: "should reject multiple in_progress todos"
  - Input: 2 todos com `status: "in_progress"`
  - Assert: `result.success === false`, error contains "only ONE"
- [ ] Teste: "should emit todos_updated event"
  - Mock RuntimeState
  - Assert: event emitted com dados corretos
- [ ] Rodar testes: `pnpm test todoWrite.test.ts`

**Critério de aceitação**: 3+ testes passando

---

#### Task 1.2.6: Integration & Registration (15min)
- [ ] Exportar `TodoWriteTool` em `src/tools/todoWrite.ts`
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas
- [ ] Rodar `pnpm test` (all tests)
- [ ] Verificar webview render (se possível)

**Critério de aceitação**: Tool registrada, funcional

---

#### Task 1.2.7: Documentation & Commit (15min)
- [ ] Adicionar JSDoc
- [ ] Documentar regras no description
- [ ] Adicionar exemplo de uso
- [ ] Commit: `feat: register TodoWrite as tool with state integration`

**Critério de aceitação**: Commit criado

---

## 1.3 ReadFile Image Support

**Esforço Total**: 6 horas
**Prioridade**: 🔴 P0
**Dependências**: Nenhuma (parser manual de headers)

### Subtasks

#### Task 1.3.1: Extend Schema (20min)
- [ ] Modificar `src/tools/filesystem.ts`
- [ ] Estender `ReadFileSchema`
  - [ ] Adicionar `encoding: z.enum(["utf-8", "utf8", "base64", "image"])`
  - [ ] Adicionar `imageMetadata: z.boolean().optional()`
- [ ] Criar interface `ReadFileOutput` (union type)
  - [ ] `content?: string` (para texto)
  - [ ] `image?: { base64, format, width, height, size }` (para imagens)
- [ ] Atualizar type signature da tool: `Tool<ReadFileInput, ReadFileOutput>`

**Critério de aceitação**: Schema estendido, compila

---

#### Task 1.3.2: Image Detection Logic (30min)
- [ ] Implementar detecção de imagem no `execute()`
  - [ ] Extrair extensão: `path.extname(absolutePath).toLowerCase()`
  - [ ] Lista de extensões: `[".jpg", ".jpeg", ".png", ".gif", ".webp"]`
  - [ ] Criar flag: `const isImage = imageExtensions.includes(ext)`
- [ ] Adicionar branch: `if (isImage && input.encoding === "image")`
  - [ ] Retornar output com campo `image`
- [ ] Manter branch original para texto

**Critério de aceitação**: Lógica de branch implementada

---

#### Task 1.3.3: PNG Parser (1h)
- [ ] Criar função `parsePngDimensions(buffer: Uint8Array): { width, height }`
- [ ] PNG format:
  - [ ] Bytes 16-23 contêm width/height (big-endian, 4 bytes cada)
  - [ ] Width: `(buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19]`
  - [ ] Height: `(buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23]`
- [ ] Testes unitários:
  - [ ] Mock PNG header bytes
  - [ ] Verificar width/height corretos
  - [ ] Testar com PNG real (leitura de fixture)

**Critério de aceitação**: Parser PNG funcional com testes

---

#### Task 1.3.4: JPEG Parser (1h)
- [ ] Criar função `parseJpegDimensions(buffer: Uint8Array): { width, height }`
- [ ] JPEG format:
  - [ ] Scan buffer para SOF marker (0xFF 0xC0)
  - [ ] Loop: `for (let i = 0; i < buffer.length - 9; i++)`
  - [ ] Check: `if (buffer[i] === 0xff && buffer[i + 1] === 0xc0)`
  - [ ] Height: `(buffer[i + 5] << 8) | buffer[i + 6]`
  - [ ] Width: `(buffer[i + 7] << 8) | buffer[i + 8]`
- [ ] Testes unitários:
  - [ ] Mock JPEG header com SOF marker
  - [ ] Verificar width/height
  - [ ] Testar com JPEG real

**Critério de aceitação**: Parser JPEG funcional com testes

---

#### Task 1.3.5: GIF Parser (45min)
- [ ] Criar função `parseGifDimensions(buffer: Uint8Array): { width, height }`
- [ ] GIF format:
  - [ ] Bytes 6-9 contêm width/height (little-endian, 2 bytes cada)
  - [ ] Width: `buffer[6] | (buffer[7] << 8)`
  - [ ] Height: `buffer[8] | (buffer[9] << 8)`
- [ ] Testes unitários:
  - [ ] Mock GIF header
  - [ ] Verificar dimensions
  - [ ] Testar com GIF real

**Critério de aceitação**: Parser GIF funcional com testes

---

#### Task 1.3.6: Image Metadata Function (30min)
- [ ] Criar função `parseImageDimensions(buffer, format): { width, height }`
- [ ] Switch por format:
  - [ ] `case "png"`: chamar `parsePngDimensions()`
  - [ ] `case "jpeg"` ou `"jpg"`: chamar `parseJpegDimensions()`
  - [ ] `case "gif"`: chamar `parseGifDimensions()`
  - [ ] `case "webp"`: retornar `{ width: 0, height: 0 }` (fallback)
- [ ] Criar função `readImageMetadata(buffer, ext)`
  - [ ] Normalizar format (jpg → jpeg)
  - [ ] Chamar `parseImageDimensions()`
  - [ ] Retornar `{ format, width, height }`

**Critério de aceitação**: Função wrapper implementada

---

#### Task 1.3.7: Integrate Image Reading (45min)
- [ ] Modificar branch `if (isImage && encoding === "image")`
- [ ] Chamar `readImageMetadata(content, ext)`
- [ ] Converter buffer para base64: `Buffer.from(content).toString("base64")`
- [ ] Criar output:
  ```typescript
  {
    image: {
      base64: base64String,
      format: imageInfo.format,
      width: imageInfo.width,
      height: imageInfo.height,
      size: content.byteLength,
    }
  }
  ```
- [ ] Retornar `ToolResult` com `data`

**Critério de aceitação**: Leitura de imagem funcional end-to-end

---

#### Task 1.3.8: Integration Tests (1h)
- [ ] Criar fixtures de imagens (PNG, JPEG, GIF) em `src/tools/filesystem/__fixtures__/`
- [ ] Teste: "should read PNG image with metadata"
  - Input: `{ path: "test.png", encoding: "image" }`
  - Assert: `result.data.image.format === "png"`, width/height corretos
- [ ] Teste: "should read JPEG image with metadata"
  - Input: `{ path: "test.jpg", encoding: "image" }`
  - Assert: format, dimensions corretos
- [ ] Teste: "should read GIF image with metadata"
  - Input: `{ path: "test.gif", encoding: "image" }`
  - Assert: format, dimensions corretos
- [ ] Teste: "should return base64 encoded data"
  - Assert: `result.data.image.base64` é string válida
- [ ] Teste: "should fallback to text for non-image files"
  - Input: `{ path: "test.txt", encoding: "image" }`
  - Assert: `result.data.content` existe

**Critério de aceitação**: 5+ integration tests passando

---

#### Task 1.3.9: Documentation & Commit (30min)
- [ ] Atualizar description da `ReadFileTool`
  - [ ] Documentar suporte a imagens
  - [ ] Listar formatos suportados (PNG, JPEG, GIF, WebP*)
  - [ ] Adicionar exemplo de uso com `encoding: "image"`
- [ ] Adicionar JSDoc aos parsers
- [ ] Rodar `pnpm run lint`
- [ ] Rodar `pnpm test` (all tests)
- [ ] Commit: `feat: add image reading support to ReadFile (PNG, JPEG, GIF)`

**Critério de aceitação**: Documentação completa, commit criado

---

# FASE 2: Advanced Features (P1)

**Duração**: 2 semanas
**Esforço Total**: 28 horas
**Objetivo**: Melhorar capabilities avançadas

---

## 2.1 Await Tool (Background Polling)

**Esforço Total**: 12 horas
**Prioridade**: 🟡 P1
**Dependências**: Modificação em CommandRunner

### Subtasks

#### Task 2.1.1: Background Session Infrastructure (2h)
- [ ] Modificar `src/terminal/commandRunner.ts`
- [ ] Criar interface `BackgroundSession`
  - `id: string`
  - `output: string`
  - `exitCode?: number`
  - `exited: boolean`
  - `process?: ChildProcess`
- [ ] Adicionar `private sessions = new Map<string, BackgroundSession>()`
- [ ] Criar função `generateSessionId(): string`
  - [ ] Format: `session-${Date.now()}-${counter++}`

**Critério de aceitação**: Infraestrutura de sessions criada

---

#### Task 2.1.2: Extend RunCommand Schema (30min)
- [ ] Modificar `RunCommandInputSchema`
  - [ ] Adicionar `background: z.boolean().optional()`
- [ ] Modificar interface `RunCommandOutput`
  - [ ] Adicionar `sessionId?: string`
  - [ ] Adicionar `background?: boolean`
- [ ] Atualizar description com documentação de background mode

**Critério de aceitação**: Schema estendido

---

#### Task 2.1.3: Start Background Session (2h)
- [ ] Implementar `startBackgroundSession(command, sessionId, options)`
  - [ ] Criar objeto `BackgroundSession`
  - [ ] Spawn process: `spawn("bash", ["-c", command], { cwd, shell: true })`
  - [ ] Capturar stdout: `proc.stdout.on("data", (data) => session.output += data)`
  - [ ] Capturar stderr: `proc.stderr.on("data", (data) => session.output += data)`
  - [ ] Capturar exit: `proc.on("exit", (code) => { session.exitCode = code; session.exited = true })`
  - [ ] Timeout cleanup: `setTimeout(() => { proc.kill(); sessions.delete(sessionId) }, timeout)`
  - [ ] Retornar session
- [ ] Adicionar à sessions Map

**Critério de aceitação**: Background session funcional

---

#### Task 2.1.4: Modify RunCommand Execute (1h)
- [ ] Modificar `CommandRunner.run()`
- [ ] Adicionar branch: `if (options?.background)`
  - [ ] Gerar sessionId
  - [ ] Chamar `startBackgroundSession()`
  - [ ] Adicionar à sessions Map
  - [ ] Retornar `{ stdout: "", sessionId, duration: 0, timedOut: false }`
- [ ] Manter branch original para sync execution

**Critério de aceitação**: Background mode implementado

---

#### Task 2.1.5: Get Session Status (45min)
- [ ] Implementar método `getSessionStatus(sessionId): Promise<SessionStatus | null>`
  - [ ] Buscar session: `this.sessions.get(sessionId)`
  - [ ] Se não existe, retornar `null`
  - [ ] Retornar `{ output: session.output, exitCode: session.exitCode, exited: session.exited }`
- [ ] Adicionar à interface `CommandRunner`

**Critério de aceitação**: Status retrieval funcional

---

#### Task 2.1.6: Create Await Tool (2h)
- [ ] Criar arquivo `src/tools/terminal/await.ts`
- [ ] Definir `AwaitSchema`
  - `sessionId: string`
  - `pattern?: string` (regex)
  - `timeout?: number` (default 60000)
  - `pollInterval?: number` (default 1000)
- [ ] Criar interface `AwaitOutput`
  - `matched: boolean`
  - `output: string`
  - `exitCode?: number`
  - `duration: number`
- [ ] Criar skeleton da tool

**Critério de aceitação**: Tool structure criada

---

#### Task 2.1.7: Await Polling Logic (2h)
- [ ] Implementar `AwaitTool.execute()`
- [ ] Criar polling loop:
  ```typescript
  let elapsed = 0;
  while (elapsed < timeout) {
    const status = await commandRunner.getSessionStatus(sessionId);

    // Check pattern match
    if (pattern && pattern.test(status.output)) {
      matched = true;
      break;
    }

    // Check exit
    if (status.exited) break;

    // Sleep
    await sleep(pollInterval);
    elapsed = Date.now() - startTime;
  }
  ```
- [ ] Criar helper: `function sleep(ms): Promise<void>`
- [ ] Retornar output com matched, output, exitCode, duration

**Critério de aceitação**: Polling loop funcional

---

#### Task 2.1.8: Unit Tests (2h)
- [ ] Criar `src/tools/terminal/await.test.ts`
- [ ] Mock CommandRunner
- [ ] Teste: "should wait for pattern match"
  - Mock session que emite pattern após 500ms
  - Assert: `result.data.matched === true`, `duration >= 500`
- [ ] Teste: "should timeout if pattern not matched"
  - Mock session sem pattern
  - Timeout: 1000ms
  - Assert: `result.success === false`, error contains "Timeout"
- [ ] Teste: "should return immediately if command exited"
  - Mock session com `exited: true`
  - Assert: resultado imediato
- [ ] Teste: "should return error if session not found"
  - SessionId inválido
  - Assert: error contains "Session not found"
- [ ] Rodar testes: `pnpm test await.test.ts`

**Critério de aceitação**: 4+ testes passando

---

#### Task 2.1.9: Integration & Documentation (30min)
- [ ] Exportar `AwaitTool` em `await.ts`
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas
- [ ] Atualizar description com exemplo de uso
- [ ] Rodar `pnpm test` (all)
- [ ] Commit: `feat: add Await tool for background command polling`

**Critério de aceitação**: Tool registrada, documentada

---

## 2.2 Glob Pattern Matching

**Esforço Total**: 6 horas
**Prioridade**: 🟡 P1
**Dependências**: npm install glob

### Subtasks

#### Task 2.2.1: Install Dependency (10min)
- [ ] Executar: `pnpm add glob`
- [ ] Executar: `pnpm add -D @types/glob`
- [ ] Verificar `package.json` atualizado

**Critério de aceitação**: Dependency instalada

---

#### Task 2.2.2: Create Glob Tool (1h)
- [ ] Criar arquivo `src/tools/filesystem/glob.ts`
- [ ] Importar `import { glob } from "glob"`
- [ ] Definir `GlobSchema`
  - `pattern: string` (e.g., `**/*.ts`)
  - `ignore?: string[]` (paths to exclude)
  - `maxResults?: number` (default 1000)
  - `followSymlinks?: boolean`
- [ ] Criar interface de output: `string[]` (lista de paths)
- [ ] Criar skeleton da tool

**Critério de aceitação**: Tool structure criada

---

#### Task 2.2.3: Implement Execute Logic (1h)
- [ ] Implementar `GlobTool.execute()`
- [ ] Chamar glob:
  ```typescript
  const results = await glob(input.pattern, {
    cwd: context.workspaceRoot,
    ignore: input.ignore ?? ["node_modules/**", ".git/**"],
    absolute: false,
    followSymbolicLinks: input.followSymlinks ?? false,
  });
  ```
- [ ] Limitar resultados: `results.slice(0, maxResults)`
- [ ] Retornar `ToolResult` com array de paths

**Critério de aceitação**: Execute funcional

---

#### Task 2.2.4: Unit Tests (2h)
- [ ] Criar `src/tools/filesystem/glob.test.ts`
- [ ] Setup: criar temp directory com arquivos de teste
- [ ] Teste: "should find all TypeScript files"
  - Pattern: `**/*.ts`
  - Assert: encontra arquivos .ts, não encontra .js
- [ ] Teste: "should support multi-extension patterns"
  - Pattern: `src/**/*.{ts,tsx}`
  - Assert: encontra .ts e .tsx em src/
- [ ] Teste: "should respect ignore patterns"
  - Pattern: `**/*.ts`
  - Ignore: `["node_modules/**"]`
  - Assert: não encontra arquivos em node_modules/
- [ ] Teste: "should limit results to maxResults"
  - Pattern: `**/*`
  - MaxResults: 10
  - Assert: retorna no máximo 10 resultados
- [ ] Teste: "should use default ignore for node_modules and .git"
  - Assert: default ignore aplicado
- [ ] Rodar testes: `pnpm test glob.test.ts`

**Critério de aceitação**: 5+ testes passando

---

#### Task 2.2.5: Deprecate SearchFiles (30min)
- [ ] Marcar `SearchFilesTool` como deprecated
- [ ] Adicionar `@deprecated Use GlobTool instead` no JSDoc
- [ ] Atualizar description para apontar para Glob
- [ ] (Opcional) Remover da lista de tools registradas
- [ ] Atualizar docs mencionando migration

**Critério de aceitação**: SearchFiles deprecated

---

#### Task 2.2.6: Integration & Documentation (1h)
- [ ] Exportar `GlobTool` em `glob.ts`
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas
- [ ] Atualizar description com exemplos:
  - [ ] Find all tests: `**/*.test.ts`
  - [ ] Find components: `src/components/**/*.tsx`
  - [ ] Exclude dist: `ignore: ["dist/**"]`
- [ ] Rodar `pnpm run lint`
- [ ] Rodar `pnpm test` (all)
- [ ] Commit: `feat: add Glob tool with advanced pattern matching`

**Critério de aceitação**: Tool registrada, SearchFiles deprecated

---

## 2.3 WebFetch Tool

**Esforço Total**: 10 horas
**Prioridade**: 🟢 P2
**Dependências**: npm install turndown

### Subtasks

#### Task 2.3.1: Install Dependencies (10min)
- [ ] Executar: `pnpm add turndown`
- [ ] Executar: `pnpm add -D @types/turndown`
- [ ] Verificar `package.json` atualizado

**Critério de aceitação**: Dependencies instaladas

---

#### Task 2.3.2: Create WebFetch Tool (1h)
- [ ] Criar arquivo `src/tools/web/webFetch.ts`
- [ ] Criar diretório `src/tools/web/` se não existir
- [ ] Importar `import TurndownService from "turndown"`
- [ ] Definir `WebFetchSchema`
  - `url: z.string().url()`
  - `timeout?: number` (default 10000)
  - `followRedirects?: boolean`
- [ ] Criar interface `WebFetchOutput`
  - `markdown: string`
  - `url: string`
  - `statusCode: number`
  - `contentType: string`
- [ ] Criar skeleton da tool

**Critério de aceitação**: Tool structure criada

---

#### Task 2.3.3: Implement Fetch Logic (2h)
- [ ] Implementar `WebFetchTool.execute()`
- [ ] Criar AbortController com timeout:
  ```typescript
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  ```
- [ ] Fazer fetch:
  ```typescript
  const response = await fetch(input.url, {
    signal: controller.signal,
    redirect: input.followRedirects ? "follow" : "manual",
  });
  clearTimeout(timeoutId);
  ```
- [ ] Ler response:
  ```typescript
  const contentType = response.headers.get("content-type") ?? "text/plain";
  const text = await response.text();
  ```
- [ ] Handle timeout error (AbortError)

**Critério de aceitação**: Fetch funcional com timeout

---

#### Task 2.3.4: HTML to Markdown Conversion (2h)
- [ ] Implementar conversão HTML:
  ```typescript
  if (contentType.includes("text/html")) {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    markdown = turndown.turndown(text);
  }
  ```
- [ ] Configurar Turndown:
  - [ ] Headings: `atx` (## format)
  - [ ] Code blocks: `fenced` (``` format)
  - [ ] (Opcional) Custom rules para elementos específicos
- [ ] Testar com HTML real (fixture)

**Critério de aceitação**: HTML→Markdown funcional

---

#### Task 2.3.5: JSON Pretty-Print (30min)
- [ ] Implementar branch JSON:
  ```typescript
  if (contentType.includes("application/json")) {
    const json = JSON.parse(text);
    markdown = "```json\n" + JSON.stringify(json, null, 2) + "\n```";
  }
  ```
- [ ] Handle JSON parse error (try-catch)
- [ ] Fallback para plain text se parse falhar

**Critério de aceitação**: JSON formatting funcional

---

#### Task 2.3.6: Plain Text Fallback (15min)
- [ ] Implementar else branch:
  ```typescript
  else {
    markdown = text; // Plain text passthrough
  }
  ```
- [ ] Retornar output com todos os campos

**Critério de aceitação**: Fallback implementado

---

#### Task 2.3.7: Unit Tests (3h)
- [ ] Criar `src/tools/web/webFetch.test.ts`
- [ ] Mock `global.fetch`
- [ ] Teste: "should fetch and convert HTML to markdown"
  - Mock response: HTML simples
  - Assert: markdown contém headings/links convertidos
- [ ] Teste: "should pretty-print JSON responses"
  - Mock response: JSON object
  - Assert: markdown contém ``` json block formatado
- [ ] Teste: "should return plain text for text/plain"
  - Mock response: plain text
  - Assert: markdown === text original
- [ ] Teste: "should timeout after specified duration"
  - Mock fetch que nunca responde
  - Timeout: 1000ms
  - Assert: error contains "timeout" ou "abort"
- [ ] Teste: "should follow redirects when enabled"
  - Mock redirect response
  - Assert: fetch chamado com `redirect: "follow"`
- [ ] Teste: "should handle fetch errors gracefully"
  - Mock fetch reject
  - Assert: `result.success === false`, error message presente
- [ ] Rodar testes: `pnpm test webFetch.test.ts`

**Critério de aceitação**: 6+ testes passando

---

#### Task 2.3.8: Optional: Response Caching (1h)
- [ ] (Opcional) Criar simple cache: `Map<url, { markdown, timestamp }>`
- [ ] TTL: 5 minutos
- [ ] Check cache antes de fetch
- [ ] Invalidar cache após TTL

**Critério de aceitação**: Cache funcional (opcional)

---

#### Task 2.3.9: Integration & Documentation (30min)
- [ ] Exportar `WebFetchTool` em `webFetch.ts`
- [ ] Criar `src/tools/web/index.ts` e re-exportar
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas
- [ ] Atualizar description com exemplos:
  - [ ] Read API docs: `{ url: "https://docs.anthropic.com/..." }`
  - [ ] Fetch library docs
- [ ] Rodar `pnpm run lint`
- [ ] Rodar `pnpm test` (all)
- [ ] Commit: `feat: add WebFetch tool with HTML→Markdown conversion`

**Critério de aceitação**: Tool registrada, documentada

---

# FASE 3: Subagents System (P0)

**Duração**: 4 semanas
**Esforço Total**: 80 horas
**Objetivo**: Sistema completo de subagentes — maior feature

---

## 3.1 Subagent Core Infrastructure

**Esforço Total**: 30 horas
**Prioridade**: 🔴 P0

### Week 1: Foundation

#### Task 3.1.1: Create Directory Structure (15min)
- [ ] Criar diretório `src/core/subagent/`
- [ ] Criar arquivos vazios:
  - `subagentTypes.ts`
  - `subagentRunner.ts`
  - `subagentRunner.test.ts`
  - `index.ts`

**Critério de aceitação**: Directory structure criada

---

#### Task 3.1.2: Define Subagent Types (1h)
- [ ] Criar `src/core/subagent/subagentTypes.ts`
- [ ] Definir `type SubagentType = "explore" | "shell" | "review" | "test" | "plan"`
- [ ] Criar interface `SubagentConfig`:
  - `type: SubagentType`
  - `allowedTools: readonly string[]`
  - `maxIterations: number`
  - `timeout: number`
  - `isolated: boolean`
- [ ] Definir `SUBAGENT_CONFIGS: Record<SubagentType, SubagentConfig>`
  - [ ] explore config (allowedTools: ReadFile, Grep, FindReferences, FindSymbols, ListDirectory, Glob)
  - [ ] shell config (allowedTools: RunCommand, Await)
  - [ ] review config (allowedTools: ReadFile, GitDiff, GitStatus, Grep, ChangedFiles)
  - [ ] test config (allowedTools: RunCommand, ReadFile, Await)
  - [ ] plan config (allowedTools: ReadFile, Grep, WorkspaceGraph, FindReferences)

**Critério de aceitação**: Types definidos, config completo

---

#### Task 3.1.3: Define Request/Result Interfaces (30min)
- [ ] Criar interface `SubagentRequest`:
  - `type: SubagentType`
  - `prompt: string`
  - `context?: Record<string, unknown>`
  - `parentStateSnapshot?: unknown`
- [ ] Criar interface `SubagentResult`:
  - `success: boolean`
  - `output: string`
  - `iterations: number`
  - `duration: number`
  - `error?: string`
  - `metadata?: { toolsCalled, tokensUsed }`

**Critério de aceitação**: Interfaces definidas

---

#### Task 3.1.4: SubagentRunner Class Skeleton (1h)
- [ ] Criar `src/core/subagent/subagentRunner.ts`
- [ ] Importar dependencies (RuntimeState, ExecutionEngine, ToolRegistry, Provider)
- [ ] Criar class `SubagentRunner`:
  ```typescript
  export class SubagentRunner {
    constructor(
      private readonly provider: Provider,
      private readonly parentRegistry: ToolRegistry,
    ) {}

    async run(request: SubagentRequest): Promise<SubagentResult> {
      // TODO: implement
    }

    private createSubagentState(config, request): RuntimeState {
      // TODO: implement
    }

    private createSubagentRegistry(config): ToolRegistry {
      // TODO: implement
    }

    private buildSubagentPrompt(type): string {
      // TODO: implement
    }
  }
  ```

**Critério de aceitação**: Class skeleton criada, compila

---

#### Task 3.1.5: Implement createSubagentRegistry (2h)
- [ ] Implementar `createSubagentRegistry(config: SubagentConfig)`
- [ ] Criar nova `ToolRegistry()`
- [ ] Loop por `config.allowedTools`:
  - [ ] Buscar tool no `parentRegistry.get(toolName)`
  - [ ] Se existe, registrar no novo registry
- [ ] Retornar registry isolado
- [ ] Testar isolamento (registry não tem tools não-allowed)

**Critério de aceitação**: Registry isolado funcional

---

#### Task 3.1.6: Implement createSubagentState (2h)
- [ ] Implementar `createSubagentState(config, request)`
- [ ] Branch: `if (config.isolated)`
  - [ ] Criar novo `RuntimeState({ mode: "agent", systemPrompt })`
- [ ] Branch: `else` (shared state)
  - [ ] (TODO: State restoration) Criar novo state por enquanto
- [ ] System prompt:
  - [ ] Chamar `this.buildSubagentPrompt(request.type)`
- [ ] Retornar RuntimeState

**Critério de aceitação**: State creation funcional

---

#### Task 3.1.7: Build System Prompts (3h)
- [ ] Implementar `buildSubagentPrompt(type: SubagentType): string`
- [ ] Criar prompts detalhados para cada tipo:
  - [ ] **explore**: "You are an exploration subagent. Find files, symbols, references. Tools: ReadFile, Grep, FindReferences, FindSymbols, ListDirectory, Glob. Return findings in structured format."
  - [ ] **shell**: "You are a shell execution subagent. Run commands safely. Tools: RunCommand, Await. Report output and errors."
  - [ ] **review**: "You are a code review subagent. Analyze for security, quality, conventions. Tools: ReadFile, GitDiff, GitStatus, Grep, ChangedFiles. Return structured list of issues with severity."
  - [ ] **test**: "You are a test execution subagent. Run tests, report results. Tools: RunCommand, ReadFile, Await. Return pass/fail summary with failure details."
  - [ ] **plan**: "You are a planning subagent. Design implementation strategies. Tools: ReadFile, Grep, WorkspaceGraph, FindReferences. Return structured plan in Markdown."
- [ ] Adicionar instruções específicas por tipo
- [ ] Adicionar output format guidance

**Critério de aceitação**: Prompts detalhados para todos os tipos

---

#### Task 3.1.8: Implement run() Method (4h)
- [ ] Implementar `SubagentRunner.run(request)`
- [ ] Get config: `const config = SUBAGENT_CONFIGS[request.type]`
- [ ] Criar state: `const subagentState = this.createSubagentState(config, request)`
- [ ] Criar registry: `const subagentRegistry = this.createSubagentRegistry(config)`
- [ ] Criar ExecutionEngine: `const engine = new ExecutionEngine(subagentState, subagentRegistry, this.provider)`
- [ ] Run engine:
  ```typescript
  const result = await engine.run({
    userMessage: request.prompt,
    maxIterations: config.maxIterations,
    timeout: config.timeout,
  });
  ```
- [ ] Criar SubagentResult:
  - `success: result.success`
  - `output: result.finalOutput ?? ""`
  - `iterations: result.iterations`
  - `duration: Date.now() - startTime`
  - `metadata: { toolsCalled, tokensUsed }`
- [ ] Error handling (try-catch)
- [ ] Retornar result

**Critério de aceitação**: run() funcional end-to-end

---

#### Task 3.1.9: Unit Tests — createSubagentRegistry (2h)
- [ ] Criar `src/core/subagent/subagentRunner.test.ts`
- [ ] Setup: mock parentRegistry com 10 tools
- [ ] Teste: "should create registry with only allowed tools"
  - Config: explore (6 allowed tools)
  - Assert: registry tem exatamente 6 tools
  - Assert: não tem WriteFile, DeleteFile, etc.
- [ ] Teste: "should create empty registry if no allowed tools exist"
  - Config: allowed tools não existem no parent
  - Assert: registry.list().length === 0
- [ ] Teste: "should isolate registries (no shared state)"
  - Criar 2 registries
  - Modificar um
  - Assert: outro não afetado

**Critério de aceitação**: 3+ testes passando

---

#### Task 3.1.10: Unit Tests — createSubagentState (2h)
- [ ] Teste: "should create isolated state for explore subagent"
  - Config: explore (isolated: true)
  - Assert: new RuntimeState criado
  - Assert: mode === "agent"
- [ ] Teste: "should create state with correct system prompt"
  - Assert: systemPrompt contém instruções do tipo
- [ ] Teste: "should handle non-isolated state (plan)"
  - Config: plan (isolated: false)
  - Assert: state criado (por enquanto sem restoration)

**Critério de aceitação**: 3+ testes passando

---

#### Task 3.1.11: Unit Tests — run() Integration (4h)
- [ ] Mock Provider (retornar respostas fake)
- [ ] Mock parent ToolRegistry
- [ ] Teste: "should run explore subagent successfully"
  - Request: `{ type: "explore", prompt: "Find UserService" }`
  - Mock provider response: "Found in src/services/UserService.ts"
  - Assert: `result.success === true`
  - Assert: `result.output` contém "UserService"
- [ ] Teste: "should respect maxIterations limit"
  - Mock provider que sempre pede outra iteração
  - Config: maxIterations 5
  - Assert: `result.iterations <= 5`
- [ ] Teste: "should timeout after configured duration"
  - Mock provider que demora demais
  - Config: timeout 1000ms
  - Assert: duration <= 1000ms (com margem)
- [ ] Teste: "should only allow configured tools"
  - Mock provider tenta chamar WriteFile
  - Config: explore (não tem WriteFile)
  - Assert: tool call falha
- [ ] Teste: "should handle provider errors gracefully"
  - Mock provider throw error
  - Assert: `result.success === false`, error message presente
- [ ] Rodar testes: `pnpm test subagentRunner.test.ts`

**Critério de aceitação**: 5+ integration tests passando

---

#### Task 3.1.12: ExecutionEngine Refactor (3h)
- [ ] Modificar `src/core/runtime/executionEngine.ts`
- [ ] Aceitar custom ToolRegistry no constructor:
  ```typescript
  constructor(
    private readonly state: RuntimeState,
    private readonly toolRegistry: ToolRegistry, // Injetado
    private readonly provider: Provider,
  ) {}
  ```
- [ ] Substituir `globalToolRegistry` por `this.toolRegistry`
- [ ] Atualizar callers (main agent loop) para passar global registry
- [ ] Rodar todos os testes de ExecutionEngine
- [ ] Verificar que nada quebrou

**Critério de aceitação**: ExecutionEngine aceita custom registry, testes passam

---

#### Task 3.1.13: Documentation (1h)
- [ ] Adicionar JSDoc para SubagentRunner
- [ ] Documentar cada método (purpose, params, returns)
- [ ] Criar `docs/subagents.md` com arquitetura:
  - [ ] Tipos de subagents
  - [ ] Allowed tools por tipo
  - [ ] System prompts
  - [ ] Isolation strategy
  - [ ] Usage examples
- [ ] Commit: `feat: add SubagentRunner core infrastructure`

**Critério de aceitação**: Documentação completa

---

### Week 2: Task Tool

#### Task 3.2.1: Create Task Tool Skeleton (1h)
- [ ] Criar arquivo `src/tools/task.ts`
- [ ] Importar SubagentRunner, types
- [ ] Definir `TaskSchema`:
  - `type: z.enum(["explore", "shell", "review", "test", "plan"])`
  - `prompt: z.string().min(1)`
  - `context?: z.record(z.unknown())`
  - `async?: z.boolean()` (default false)
- [ ] Criar interface `TaskOutput`:
  - `success: boolean`
  - `output: string`
  - `iterations: number`
  - `duration: number`
  - `taskId?: string` (for async)
- [ ] Criar skeleton da tool

**Critério de aceitação**: Tool structure criada

---

#### Task 3.2.2: Task ID Generation (30min)
- [ ] Criar função `generateTaskId(): string`
  - Format: `task-${Date.now()}-${counter++}`
  - Counter global incrementando
- [ ] Criar storage: `const taskResults = new Map<string, SubagentResult>()`
- [ ] Criar função `storeTaskResult(taskId, result): void`
  - Adicionar ao Map
- [ ] (Opcional) Cleanup de tasks antigas (TTL)

**Critério de aceitação**: Task ID generation funcional

---

#### Task 3.2.3: Synchronous Execution (2h)
- [ ] Implementar branch sync em `TaskTool.execute()`
- [ ] Get dependencies from DI container:
  - `const provider = container.get(TOKENS.Provider)`
  - `const parentRegistry = container.get(TOKENS.ToolRegistry)`
- [ ] Criar SubagentRunner: `new SubagentRunner(provider, parentRegistry)`
- [ ] Run subagent:
  ```typescript
  const result = await runner.run({
    type: input.type as SubagentType,
    prompt: input.prompt,
    context: input.context,
  });
  ```
- [ ] Mapear result para TaskOutput
- [ ] Retornar ToolResult

**Critério de aceitação**: Sync execution funcional

---

#### Task 3.2.4: Asynchronous Execution (2h)
- [ ] Implementar branch async: `if (input.async)`
- [ ] Gerar taskId
- [ ] Fire and forget:
  ```typescript
  runner.run({ ... }).then((result) => {
    storeTaskResult(taskId, result);
  });
  ```
- [ ] Retornar imediatamente com taskId:
  ```typescript
  return {
    success: true,
    data: {
      success: true,
      output: "",
      iterations: 0,
      duration: 0,
      taskId,
    },
  };
  ```

**Critério de aceitação**: Async execution funcional

---

#### Task 3.2.5: Allowed Mode & Approval (30min)
- [ ] Implementar `allowedInMode(mode)`: apenas `agent`
- [ ] (Opcional) Implementar `requiresApproval()`:
  - Background tasks requerem approval?
  - Ou sempre auto-approve?
- [ ] Atualizar description com security notes

**Critério de aceitação**: Mode restrictions implementadas

---

#### Task 3.2.6: Unit Tests (4h)
- [ ] Criar `src/tools/task.test.ts`
- [ ] Mock SubagentRunner
- [ ] Teste: "should run explore subagent synchronously"
  - Input: `{ type: "explore", prompt: "Find X" }`
  - Mock runner retorna success
  - Assert: `result.data.success === true`, output presente
- [ ] Teste: "should run shell subagent synchronously"
  - Input: `{ type: "shell", prompt: "Run tests" }`
  - Assert: result contém iterations, duration
- [ ] Teste: "should run task in background when async=true"
  - Input: `{ type: "test", prompt: "Run unit tests", async: true }`
  - Assert: `result.data.taskId` existe
  - Assert: retorna imediatamente (duration ~0)
- [ ] Teste: "should store background task results"
  - Run async task
  - Wait for completion
  - Assert: `taskResults.get(taskId)` existe
- [ ] Teste: "should propagate subagent errors"
  - Mock runner throw error
  - Assert: `result.success === false`, error message
- [ ] Teste: "should only allow in agent mode"
  - Context: mode "plan"
  - Assert: tool.allowedInMode("plan") === false
- [ ] Rodar testes: `pnpm test task.test.ts`

**Critério de aceitação**: 6+ testes passando

---

#### Task 3.2.7: Integration Test — End to End (3h)
- [ ] Teste real (não mock):
  - [ ] Setup real ToolRegistry com tools
  - [ ] Setup real Provider (ou mock realistic)
  - [ ] Run explore task: "Find all .test.ts files"
  - [ ] Assert: output contém lista de arquivos
- [ ] Teste real shell:
  - [ ] Run: "echo 'Hello World'"
  - [ ] Assert: output contém "Hello World"
- [ ] Teste timeout:
  - [ ] Run task com timeout 1s
  - [ ] Mock provider que demora 5s
  - [ ] Assert: timeout respeitado

**Critério de aceitação**: E2E tests passando

---

#### Task 3.2.8: Registration & Documentation (1h)
- [ ] Exportar `TaskTool` em `task.ts`
- [ ] Importar em `src/tools/index.ts`
- [ ] Adicionar à lista de tools registradas
- [ ] Atualizar description com exemplos detalhados:
  - [ ] Explore: `{ type: "explore", prompt: "Find UserService usages" }`
  - [ ] Shell: `{ type: "shell", prompt: "Run npm test" }`
  - [ ] Review: `{ type: "review", prompt: "Review PR #123" }`
  - [ ] Test: `{ type: "test", prompt: "Run unit tests for auth module" }`
  - [ ] Plan: `{ type: "plan", prompt: "Design caching strategy" }`
- [ ] Documentar async mode
- [ ] Rodar `pnpm run lint`
- [ ] Rodar `pnpm test` (all)
- [ ] Commit: `feat: add Task tool for launching subagents`

**Critério de aceitação**: Tool registrada, documentada

---

### Week 3-4: Polish & Optimizations

#### Task 3.3.1: State Serialization (8h)
- [ ] (Feature avançado) Implementar serialization de RuntimeState
- [ ] Criar método `RuntimeState.serialize(): unknown`
  - Serializar conversationState
  - Serializar checkpoints (opcional)
  - Serializar metrics (opcional)
- [ ] Criar método `RuntimeState.deserialize(snapshot): RuntimeState`
  - Restaurar state a partir de snapshot
- [ ] Integrar com `createSubagentState()`:
  - Se `request.parentStateSnapshot` existe, deserializar
- [ ] Testes de serialization/deserialization

**Critério de aceitação**: State pode ser passado de parent para child

---

#### Task 3.3.2: Subagent Pooling (6h)
- [ ] (Otimização) Criar pool de subagent contexts
- [ ] Reuse RuntimeState + ToolRegistry para mesmo tipo
- [ ] Evitar criação repetida de objects pesados
- [ ] Implementar LRU eviction (max 5 contexts cached)
- [ ] Testes de pooling

**Critério de aceitação**: Performance melhorada (bench)

---

#### Task 3.3.3: Result Streaming (6h)
- [ ] (Feature avançado) Stream progress updates de subagents
- [ ] Modificar SubagentRunner para emitir eventos:
  - `iteration_start`
  - `tool_called`
  - `iteration_complete`
- [ ] Parent pode listen eventos
- [ ] Testes de streaming

**Critério de aceitação**: Progress updates funcionais

---

#### Task 3.3.4: Resource Limits (4h)
- [ ] Adicionar resource limits a SubagentConfig:
  - `maxMemory?: number` (MB)
  - `maxCpu?: number` (% usage)
- [ ] Monitor resource usage durante execution
- [ ] Kill subagent se exceder limites
- [ ] Testes de resource enforcement

**Critério de aceitação**: Resource limits funcionais

---

#### Task 3.3.5: Error Recovery (4h)
- [ ] Implementar retry logic para subagent failures
- [ ] Config: `maxRetries: 2` (default)
- [ ] Exponential backoff entre retries
- [ ] Preservar context entre retries
- [ ] Testes de retry

**Critério de aceitação**: Retry logic funcional

---

#### Task 3.3.6: Metrics Collection (3h)
- [ ] Coletar métricas de subagents:
  - Execution time por tipo
  - Success rate
  - Tool usage distribution
  - Iteration counts
- [ ] Expor via `SubagentRunner.getMetrics()`
- [ ] Integrar com ToolMetrics global
- [ ] Dashboard de métricas (opcional)

**Critério de aceitação**: Metrics coletadas

---

#### Task 3.3.7: Comprehensive Testing (6h)
- [ ] Criar test suite abrangente:
  - [ ] Todos os 5 tipos de subagents
  - [ ] Edge cases (empty output, timeout, error)
  - [ ] Concurrency (multiple subagents paralelos)
  - [ ] Resource limits
  - [ ] Retry logic
  - [ ] State serialization
- [ ] Integration tests end-to-end
- [ ] Performance benchmarks
- [ ] Stress tests (100+ subagents sequenciais)

**Critério de aceitação**: 30+ testes passando

---

#### Task 3.3.8: Documentation — Complete (3h)
- [ ] Atualizar `docs/subagents.md` com:
  - [ ] Arquitetura detalhada
  - [ ] Diagrama de fluxo (parent → child)
  - [ ] Examples por tipo de subagent
  - [ ] Performance guidelines
  - [ ] Troubleshooting
  - [ ] API reference
- [ ] Criar tutorial: "How to add a new subagent type"
- [ ] Adicionar exemplos de código real
- [ ] Commit: `docs: comprehensive subagent documentation`

**Critério de aceitação**: Docs completos

---

#### Task 3.3.9: Final Integration (2h)
- [ ] Rodar full test suite: `pnpm test`
- [ ] Verificar coverage (target: 80%+)
- [ ] Rodar lint: `pnpm run lint`
- [ ] Build: `pnpm run build`
- [ ] Manual testing via provider
- [ ] Commit: `feat: subagents system complete (explore, shell, review, test, plan)`

**Critério de aceitação**: Sistema completo, todos testes passando

---

## 📊 Progress Tracking Template

Use esta tabela para track progresso:

```markdown
## Sprint 0 — Roadmap Alignment

| Task ID | Descrição | Esforço | Status | Completed |
|---------|-----------|---------|--------|-----------|
| 0.1 | Confirmar estado atual das tools | 30min | ✅ Done | 2026-05-22 |
| 0.2 | Corrigir sequência de entrega | 45min | ✅ Done | 2026-05-22 |
| 0.3 | Preparar TDD antes da primeira implementação | 45min | ✅ Done | 2026-05-22 |
| ... | ... | ... | ... | ... |

**Status Legend**: ⚪ Todo | 🟡 In Progress | ✅ Done | ❌ Blocked
```

---

## 🎯 Checkpoints & Reviews

### Checkpoint 1: End of Phase 1 (Week 2)
- [ ] DeleteFile completo e testado
- [ ] Await/background terminal funcional
- [ ] **Review**: Code review com time
- [ ] **Decision**: Go/No-go para Phase 2

### Checkpoint 2: End of Phase 2 (Week 4)
- [ ] Task/Subagent `explore` MVP funcional
- [ ] Registry read-only isolado
- [ ] **Review**: Performance review
- [ ] **Decision**: Priorizar optimizations ou avançar para Phase 3

### Checkpoint 3: Subagent MVP (Week 6)
- [ ] ReadFile image metadata funcional
- [ ] Glob coexistente com SearchFiles
- [ ] **Review**: Architecture review
- [ ] **Decision**: Prosseguir com outros tipos ou otimizar MVP

### Checkpoint 4: Final (Week 8)
- [ ] Decisão TodoWrite documentada
- [ ] Decisão WebFetch documentada
- [ ] Plano de subagents avançados revisado
- [ ] Metrics & monitoring
- [ ] Docs completos
- [ ] **Review**: Final review & launch readiness

---

**Total Subtasks**: TBD após replanejamento por fase
**Total Estimado Inicial**: 86 horas
**Documento gerado**: 2026-05-19
**Última revisão**: 2026-05-22
**Próxima revisão**: Antes da implementação de `DeleteFile`
