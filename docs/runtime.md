# Runtime Architecture (Phase 4)

Agent Runtime - event-driven agentic execution loop for Korix Code VSCode extension.

## Overview

O Runtime é o núcleo agentic do Korix Code, responsável por orquestrar o ciclo de vida completo de interações entre Provider (Claude/Anthropic), Tool Harness, Patch Engine e Workspace.

**Status**: ✅ Complete (11 arquivos, 83 testes passando, zero erros TypeScript)

**Padrão Arquitetural**: Event-Driven com delegation clara entre componentes especializados.

## Core Components

### 1. AgentLoop (193 linhas) - MINIMALIST

**Responsabilidade**: Lifecycle orchestration apenas  
**NÃO faz**: Executar tools, parsear provider, manipular patches (delegado)

```typescript
async *run(
  initialMessage: string,
  context: ExecutionContext
): AsyncGenerator<RuntimeEvent, AgentLoopResult>
```

**Fluxo**:
1. Inicializa RuntimeState
2. Loop iterativo:
   - Check guards (max iterations, stall, duplicate tools)
   - Executa `ExecutionEngine.step()`
   - Cria checkpoint se houve tool calls
   - Incrementa iteration counter
3. Retorna AgentLoopResult com métricas

### 2. ExecutionEngine (253 linhas) - THE BRAIN

**Responsabilidade**: Orquestrar Provider ↔ Tools ↔ State

```typescript
async step(state: RuntimeState): Promise<StepResult>
```

**Fluxo**:
1. Prepara messages + tools
2. Consume provider stream (`AsyncGenerator<StreamChunk>`)
3. Processa chunks:
   - `text` → buffer + emit token event
   - `thinking` → buffer + emit thinking event
   - `tool_use` → acumula pending tool calls
   - `done` → stop reason
4. Adiciona assistant message se houver texto
5. Executa tool calls sequencialmente:
   - Check permission
   - Execute via ToolRegistry
   - Record metrics
   - Adiciona tool result message
   - Marca arquivos modificados

**Text Buffering**: Acumula texto antes de tool call para evitar mensagens fragmentadas.

### 3. RuntimeState (290 linhas) - Modular State

**4 Sub-States**:
- **ConversationState**: messages[], turnCount, toolCallHistory[]
- **ExecutionState**: isExecuting, currentIteration, maxIterations, startTime, lastActivityTime
- **WorkspaceState**: root, currentFile?, selection?, openFiles[], modifiedFiles Set
- **MemoryState**: shortTerm Map, conversationContext[], lastCheckpointId?

**Getters Imutáveis**: `getConversation()` retorna `Readonly<ConversationState>`

**Mutations Controladas**:
- `addMessage(message)`
- `recordToolCall(toolName, input, result, duration, success)`
- `incrementIteration()` - atualiza lastActivityTime
- `markFileModified(filePath)`
- `setCheckpoint(checkpointId)`

**Snapshot/Restore**: `createSnapshot()` e `restoreSnapshot(snapshot)` para rollback

### 4. CheckpointManager (105 linhas) - Incremental Snapshots

**Padrão**: Snapshot apenas modified files (não workspace inteiro)

```typescript
async create(state: RuntimeState, modifiedFiles: Set<string>): Promise<string>
async restore(checkpointId: string): Promise<void>
```

**Estrutura RuntimeCheckpoint**:
- `id`: checkpoint-{timestamp}-{random}
- `iteration`: número da iteração
- `timestamp`: Date.now()
- `modifiedFiles[]`: FileSnapshot[] com path, content, SHA-256 hash
- `operationJournal[]`: Operation[] extraído de toolCallHistory
- `memoryState`: MemorySnapshot
- `conversationSnapshot`: Message[]

**Eviction Policy**: Rolling window de 10 checkpoints (evict oldest)

**Ganho**: ~100KB checkpoint vs ~100MB se workspace inteiro

### 5. RecoveryManager (126 linhas) - Retry + Rollback

**Estratégias**:
1. **Retry** com exponential backoff (1s → 2s → 4s, max 10s)
2. **Rollback** automático após 3 tentativas falhas
3. **Fail** imediato para erros não recuperáveis

```typescript
async handleError(error: Error, state: RuntimeState, context: string): Promise<RecoveryAction>
async executeRecovery(action: RecoveryAction, state: RuntimeState): Promise<void>
```

**Erros Recuperáveis**:
- Timeout
- ECONNREFUSED (network)
- Rate limit
- HTTP 429 / 503

**Erros NÃO Recuperáveis**:
- SyntaxError
- Permission denied
- Validation errors

**Eventos**: `recovery_started`, `recovery_complete`, `checkpoint_restored`

### 6. IterationGuard (88 linhas) - Loop Prevention

**Guards**:
1. **Max Iterations**: 25 (empírico de Cursor/Claude Code)
2. **Stall Detection**: 30s sem activity → stop
3. **Duplicate Tools**: mesma tool >3x → stop
4. **No Progress**: 3 iterações idênticas (same modified files count) → stop

```typescript
checkIteration(state: RuntimeState): GuardResult
recordToolCall(toolName: string): void
recordProgress(marker: ProgressMarker): void
```

**Eventos**: `stall_detected`, `duplicate_tool_detected`, `loop_warning`

### 7. CancellationManager (64 linhas) - AbortController Wrapper

**Padrão**: Web Standard API (AbortController) com cleanup callbacks

```typescript
getSignal(): AbortSignal
registerCleanup(callback: () => void | Promise<void>): void
cancel(reason: string, currentIteration: number): Promise<void>
checkCancellation(): void // throws CancellationError se aborted
```

**Pontos de Cancellation**:
- AgentLoop.run() - início de cada iteração
- ExecutionEngine.step() - durante stream processing
- ExecutionEngine.executeToolCalls() - antes de cada tool
- CheckpointManager.create() - durante file snapshots

### 8. RuntimeMetrics (74 linhas) - Observability

**Coleta**:
- `totalTokens`, `totalToolCalls`, `iterations`, `duration`
- `checkpoints`, `recoveries`
- `toolBreakdown`: Map<toolName, count>
- `eventTimeline[]`: { type, timestamp }

```typescript
finalize(): RuntimeMetricsSnapshot
```

### 9. TaskQueue (65 linhas) - Priority Queue

**Preparação para multi-agent future**

```typescript
enqueue(task: Task): void
dequeue(): Task | null
cancel(taskId: string): void
getAbortSignal(taskId: string): AbortSignal | undefined
```

## Event System

**RuntimeEventEmitter** extends EventEmitter com 24+ typed events:

**Lifecycle**: `iteration_start`, `iteration_complete`, `execution_complete`  
**Provider**: `token`, `thinking`, `done`  
**Tools**: `tool_call`, `tool_result`, `tool_approval_required`, `tool_approved`, `tool_denied`  
**Patches**: `patch_applied`, `patch_failed`  
**Checkpoints**: `checkpoint_created`, `checkpoint_restored`  
**Errors**: `error`, `recovery_started`, `recovery_complete`  
**Guards**: `stall_detected`, `duplicate_tool_detected`, `loop_warning`  
**Control**: `cancelled`, `paused`, `resumed`

Cada evento carrega `timestamp` e dados específicos.

## Design Decisions

### Sequential Tool Execution
**Decisão**: Executar tools uma por vez  
**Razão**: Ordem determinística, evita race conditions em file writes  
**Custo**: ~2x mais lento se 2 tools independentes  
**Futuro**: Analisar dependency graph e executar independent tools em parallel

### Checkpoint Granularity
**Decisão**: Um checkpoint por iteração (se hadToolCalls)  
**Razão**: Rollback granular, fácil de raciocinar, overhead aceitável  
**Custo**: ~10-50ms overhead por checkpoint  
**Alternativa rejeitada**: Checkpoint por tool call (muito overhead)

### Max Iterations = 25
**Decisão**: Hard limit de 25 iterations  
**Razão**: Empírico de Cursor/Claude Code, previne wasted tokens  
**Custo**: Tarefa legítima pode precisar de >25 iterations  
**Mitigação**: User pode re-run com checkpoint restore

### Node.js fs vs vscode.workspace.fs
**Decisão**: Runtime usa `fs/promises` (Node.js)  
**Razão**: Testability - vscode imports quebram unit tests  
**Camada**: Runtime é core domain, não deve depender de VSCode

## Integration Points

### Provider Integration
```typescript
const stream = provider.send(messages, tools, { signal, maxTokens, temperature });
for await (const chunk of stream) {
  // Process StreamChunk { type: "text" | "thinking" | "tool_use" | "error" | "done" }
}
```

### Tool Harness Integration
```typescript
const result = await toolRegistry.execute(toolName, toolInput, {
  signal: cancellationManager.getSignal(),
  context: state.getWorkspace()
});
// ToolResult { success, data?, error?, metadata }
```

### Patch Engine Integration
Patch engine é invocado via **EditFileTool**. Quando tool retorna patches:
```typescript
if (result.metadata?.patches) {
  for (const patch of result.metadata.patches) {
    await patchApplier.apply(patch);
    eventEmitter.emitEvent({ type: 'patch_applied', file, lineNumber, operation });
  }
}
```

## DI Container Patterns

**Singletons** (um por extensão):
- RuntimeEventEmitter
- CheckpointManager
- TaskQueue

**Transient** (novo por execução):
- RuntimeMetrics
- IterationGuard
- CancellationManager
- RecoveryManager

**Não pré-registrados** (criados on-demand):
- ExecutionEngine (depende de provider instance assíncrono)
- AgentLoop (depende de ExecutionEngine)

## Test Coverage

**83 testes** em 4 suites (100% passing):

- **runtimeState.test.ts** (23 tests): initialization, messages, tool calls, iterations, file tracking, checkpoints, snapshot/restore
- **iterationGuard.test.ts** (17 tests): max iterations, stall, duplicate tools, no-progress, priority, reset
- **checkpoints.test.ts** (21 tests): creation, retrieval, restore, eviction, file snapshots, empty checkpoints
- **recovery.test.ts** (22 tests): error classification, retry strategy, rollback, executeRecovery, reset, events

**Não testados** (deferidos):
- ExecutionEngine (complexo, requer Provider mock)
- AgentLoop E2E (integration test, requer full stack)

## Performance

**Blocking Points**:
- Provider.send() - network I/O (5-30s por iteração)
- ToolRegistry.execute() - depende da tool
- CheckpointManager.create() - ~10ms por arquivo

**Memory Budget**:
- RuntimeState: ~100KB
- Checkpoints (10): ~1MB
- Event timeline: ~50KB
- Total: ~1.2MB por execução

## Next Phase

**Phase 5**: VSCode UI Integration
- Sidebar panel com event stream
- Tool approval UI
- Cancellation button
- Metrics display
- Integration com existing commands
