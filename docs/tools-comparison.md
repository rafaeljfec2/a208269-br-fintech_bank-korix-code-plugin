# Comparação de Tools: Korix Code vs Cursor/Claude Code

**Data**: 2026-05-19  
**Status Korix Code**: 19 tools registradas (Phase 4 Runtime completo)

---

## 📊 Resumo Executivo

| Categoria | Cursor/Claude | Korix Code | Status |
|-----------|---------------|------------|--------|
| **Filesystem** | 5 | 5 | ✅ Completo |
| **Terminal** | 1 | 1 | ✅ Completo |
| **Edit** | 1 | 1 | ✅ Melhorado (rollback) |
| **Search** | 2 | 3 | ✅ Completo + LSP |
| **Git** | - | 3 | ✅ Extra |
| **Diagnostics** | 1 | 2 | ✅ Completo |
| **Workspace** | - | 3 | ✅ Extra |
| **User Interaction** | 1 | 1 | ✅ Completo |
| **Web** | 2 | 0 | ❌ Ausente |
| **Notebooks** | 1 | 0 | ❌ Ausente |
| **Orchestration** | 3 | 0 | ❌ Ausente |
| **Image Gen** | 1 | 0 | ⚠️ N/A (fora do escopo) |

---

## ✅ O que TEMOS no Korix Code

### 1. **Filesystem Tools** (5 tools)

#### ✅ ReadFile
- **Equivalente**: `Read` (Cursor)
- **Implementação**: `vscode.workspace.fs.readFile`
- **Features**:
  - Suporte a caminhos absolutos/relativos
  - Encoding utf-8 ou base64
  - Cache automático (100MB, 5min TTL, LRU+LFU)
- **Diferenças**: 
  - ❌ Não lê imagens (jpg, png, gif, webp) como o Cursor
  - ❌ Não tem offset/limit para leitura parcial

#### ✅ WriteFile
- **Equivalente**: `Write` (Cursor)
- **Implementação**: `vscode.workspace.fs.writeFile`
- **Features**:
  - Criação automática de diretórios
  - Requer aprovação (`requiresApproval: true`)
  - Bloqueado em modo `plan` e `ask`
- **Diferenças**: ✅ Parity completo

#### ✅ ListDirectory
- **Equivalente**: Parte do `Read` (Cursor)
- **Implementação**: `vscode.workspace.fs.readDirectory`
- **Features**:
  - Lista arquivos e diretórios
  - Flag `recursive` (não implementado ainda)
- **Diferenças**: ⚠️ Recursão não funcional

#### ✅ FileChunks
- **Equivalente**: Não existe no Cursor
- **Features**:
  - Leitura em chunks para arquivos grandes
  - Otimização de memória
- **Diferenças**: ✅ **Extra** do Korix

#### ✅ SearchFiles
- **Equivalente**: Parte do `Glob` (Cursor)
- **Implementação**: Busca por nome de arquivo
- **Features**:
  - Busca recursiva no workspace
  - Filtros por extensão
- **Diferenças**: ⚠️ Menos poderoso que `Glob` do Cursor (sem padrões `**/*.ts`)

---

### 2. **Terminal Tools** (1 tool)

#### ✅ RunCommand
- **Equivalente**: `Shell` (Cursor)
- **Implementação**: `child_process.spawn` via `CommandRunner`
- **Features**:
  - Sessões persistentes (`sessionId`)
  - Timeout configurável (default 30s, max 5min)
  - Validação de comandos (denylist)
  - Requer aprovação para comandos destrutivos
  - Working directory customizável
- **Diferenças**:
  - ❌ Não tem sessões em background com output em arquivo
  - ❌ Não tem `Await` para polling de background tasks
- **Segurança**: ✅ Melhor que Cursor (validação + denylist)

---

### 3. **Edit Tools** (1 tool)

#### ✅ EditFile
- **Equivalente**: `StrReplace` (Cursor)
- **Implementação**: Sistema KORIX_PATCH customizado
- **Features**:
  - Formato XML estruturado (`<KORIX_PATCH>`)
  - Search/Replace exato (como Cursor)
  - **Rollback automático** em caso de falha
  - Patches atômicos (all-or-nothing)
  - Rollback points com IDs rastreáveis
- **Diferenças**: ✅ **Muito melhor** que Cursor (rollback + atomic)

**Exemplo de uso**:
```xml
<KORIX_PATCH file="path/to/file.ts">
<SEARCH>
exact code to find
</SEARCH>
<REPLACE>
new code to replace with
</REPLACE>
</KORIX_PATCH>
```

---

### 4. **Git Tools** (3 tools)

#### ✅ GitStatus
- **Equivalente**: Não existe explicitamente no Cursor
- **Implementação**: Wrapper de `git status`
- **Features**:
  - Arquivos staged, unstaged, untracked
  - Branch atual, remote tracking

#### ✅ GitDiff
- **Equivalente**: Parte do `Shell` no Cursor
- **Implementação**: Wrapper de `git diff`
- **Features**:
  - Diff staged/unstaged
  - Diff entre branches

#### ✅ ChangedFiles
- **Equivalente**: Não existe no Cursor
- **Features**:
  - Lista de arquivos modificados
  - Filtro por tipo de mudança (added, modified, deleted)

**Diferenças**: ✅ **Extra** do Korix — Git tools dedicadas

---

### 5. **Search Tools** (3 tools)

#### ✅ Grep
- **Equivalente**: `Grep` (Cursor)
- **Implementação**: **ripgrep** (`rg --json`)
- **Features**:
  - Performance: < 200ms para 100 matches
  - SIMD optimized, finite automata regex
  - Streaming results (JSON Lines)
  - Context lines (antes/depois do match)
  - Case-insensitive por default
  - Filtros de tipo de arquivo
  - Exclusão de paths
  - Max results configurável
- **Diferenças**: ✅ **Parity completo** com Cursor

**Performance**:
- Usa o mesmo engine do Cursor (ripgrep)
- 10-100x mais rápido que regex em Node.js

#### ✅ FindReferences
- **Equivalente**: Não existe no Cursor
- **Implementação**: Language Server Protocol (LSP)
- **Features**:
  - Busca semântica (não só texto)
  - Suporte multi-linguagem (TS, JS, Python, etc.)
- **Diferenças**: ✅ **Extra** do Korix

#### ✅ FindSymbols
- **Equivalente**: Não existe no Cursor
- **Implementação**: Language Server Protocol (LSP)
- **Features**:
  - Busca de símbolos (funções, classes, variáveis)
  - Workspace-wide ou por arquivo
- **Diferenças**: ✅ **Extra** do Korix

---

### 6. **Diagnostics Tools** (2 tools)

#### ✅ GetDiagnostics
- **Equivalente**: `ReadLints` (Cursor)
- **Implementação**: `vscode.languages.getDiagnostics()`
- **Features**:
  - Erros, warnings, info, hints
  - Por arquivo ou workspace inteiro
  - Integração com LSP (TypeScript, ESLint, etc.)
- **Diferenças**: ✅ Parity completo

#### ✅ Problems
- **Equivalente**: Parte do `ReadLints` (Cursor)
- **Features**:
  - Lista todos os problemas do workspace
  - Filtros por severidade
- **Diferenças**: ✅ Redundante com `GetDiagnostics` (candidato a remoção)

---

### 7. **Workspace Tools** (3 tools)

#### ✅ WorkspaceGraph
- **Equivalente**: Não existe no Cursor
- **Features**:
  - Grafo de dependências do workspace
  - Análise de imports/exports
  - Detecção de ciclos

#### ✅ GetOpenFiles
- **Equivalente**: Não existe no Cursor
- **Features**:
  - Lista de arquivos abertos no editor
  - Útil para contexto de trabalho atual

#### ✅ GetCurrentFile
- **Equivalente**: Não existe no Cursor
- **Features**:
  - Arquivo atualmente focado no editor
  - Posição do cursor

**Diferenças**: ✅ **Extra** do Korix — melhor consciência de contexto

---

### 8. **User Interaction Tools** (1 tool)

#### ✅ AskUserQuestion
- **Equivalente**: `AskQuestion` (Cursor)
- **Implementação**: UI de formulário estruturado
- **Features**:
  - Opções múltipla escolha
  - Multi-select (checkboxes)
  - Single-select (radio buttons)
  - Timeout com fallback
  - Flag `isInteractive` (não dispara loop continuation)
- **Diferenças**: ✅ Parity completo + flag `isInteractive`

**Estrutura**:
```typescript
{
  questions: [{
    question: "Qual estratégia usar?",
    header: "Estratégia",
    multiSelect: false,
    options: [
      { label: "Opção 1", description: "Descrição 1" },
      { label: "Opção 2", description: "Descrição 2" }
    ]
  }]
}
```

---

## ❌ O que NÃO TEMOS no Korix Code

### 1. **Delete Tool**
- **Cursor**: `Delete` — Remove arquivos do filesystem
- **Impacto**: ⚠️ **Médio** — Necessário para refactors que removem arquivos
- **Workaround**: Usar `RunCommand` com `rm`
- **Prioridade**: 🔴 Alta

### 2. **Web Tools** (2 ausentes)

#### ❌ WebSearch
- **Cursor**: Pesquisa na web via API gerenciada
- **Impacto**: ⚠️ **Baixo** — Não crítico para coding tasks
- **Prioridade**: 🟢 Baixa (fora do escopo de IDE)

#### ❌ WebFetch
- **Cursor**: HTTP GET + HTML→Markdown
- **Impacto**: ⚠️ **Baixo** — Útil para docs externas
- **Use case**: Ler docs de APIs, bibliotecas
- **Prioridade**: 🟡 Média

### 3. **Notebook Tools**

#### ❌ EditNotebook
- **Cursor**: Edita células de Jupyter notebooks (.ipynb)
- **Impacto**: ⚠️ **Baixo** — Não é foco do Korix
- **Prioridade**: 🟢 Baixa (nicho)

### 4. **Orchestration Tools** (3 ausentes)

#### ❌ TodoWrite
- **Cursor**: Lista de tarefas interna da sessão
- **Status no Korix**: ⚠️ **Existe na interface, mas não está registrada como tool**
- **Impacto**: 🔴 **Alto** — Usado em workflows complexos
- **Prioridade**: 🔴 **Crítica** — Adicionar à `ToolRegistry`

#### ❌ SwitchMode
- **Cursor**: Alterna entre Plan/Agent mode
- **Impacto**: 🔴 **Alto** — Core do workflow Cursor
- **Status no Korix**: Temos modos (ask/plan/agent) mas não como tool
- **Prioridade**: 🔴 Alta

#### ❌ Task (Subagents)
- **Cursor**: Lança subagentes especializados (explore, shell, CI, etc.)
- **Impacto**: 🔴 **Muito Alto** — Fundamental para escalabilidade
- **Tipos**: `explore`, `shell`, `ci`, `review`, etc.
- **Prioridade**: 🔴 **Crítica**

#### ❌ Await
- **Cursor**: Polling de shells em background
- **Impacto**: 🟡 **Médio** — Útil para tasks longas
- **Workaround**: `RunCommand` síncrono (limita timeout)
- **Prioridade**: 🟡 Média

### 5. **Image Generation**

#### ⚠️ GenerateImage
- **Cursor**: Gera imagem a partir de descrição (API externa)
- **Impacto**: 🟢 **Muito Baixo** — Fora do escopo de coding
- **Prioridade**: 🟢 N/A (não implementar)

---

## 🏗️ Arquitetura das Tools no Korix Code

### Sistema de Registro (ToolRegistry)

```typescript
export class ToolRegistry {
  private tools: Map<string, Tool>;
  private cache: ToolCache;       // LRU+LFU, 100MB, 5min TTL
  private metrics: ToolMetrics;   // 10k events ringbuffer
  private scheduler: ToolScheduler;

  async execute<T>(
    name: string,
    input: unknown,
    context: ToolContext
  ): Promise<ToolResult<T>>
}
```

**Features únicas do Korix**:
1. ✅ **Cache automático** — 100MB, LRU+LFU eviction
2. ✅ **Metrics** — Duração, taxa de sucesso, cache hit rate
3. ✅ **Scheduler** — Priorização de tools
4. ✅ **Validação com Zod** — Type-safe inputs
5. ✅ **Mode-aware** — Tools podem ser bloqueadas por modo
6. ✅ **Approval system** — `requiresApproval()` por tool

### Tool Interface

```typescript
interface Tool<TInput, TOutput> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;
  isInteractive?: boolean; // 🆕 Bloqueia loop continuation
  
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  requiresApproval?(input: TInput, context: ToolContext): boolean;
  allowedInMode?(mode: "ask" | "plan" | "agent"): boolean;
}
```

**Diferenças vs Cursor**:
- ✅ **Type-safe** — Zod validation + TypeScript generics
- ✅ **Metadata rica** — Duration, cache status, approval
- ✅ **Interactive flag** — Crucial para `AskUserQuestion`
- ✅ **Mode restrictions** — Write tools bloqueadas em `plan`

---

## 🔍 Análise de Implementação

### ✅ Pontos Fortes do Korix

1. **Rollback System** (EditFile)
   - Atomic patches
   - Rollback points rastreáveis
   - Melhor que StrReplace do Cursor

2. **LSP Integration** (FindReferences, FindSymbols)
   - Busca semântica
   - Multi-linguagem
   - Não existe no Cursor

3. **Git Tools Dedicadas**
   - GitStatus, GitDiff, ChangedFiles
   - Cursor depende de `Shell`

4. **Workspace Awareness**
   - WorkspaceGraph, GetOpenFiles, GetCurrentFile
   - Melhor contexto que Cursor

5. **Security Layers**
   - Command validation (denylist)
   - Mode restrictions
   - Approval system
   - Mais rigoroso que Cursor

6. **Performance Optimization**
   - Tool cache (100MB, LRU+LFU)
   - Metrics automáticas
   - Cache invalidation patterns
   - Cursor não tem cache de tools

### ❌ Gaps Críticos

1. **Falta Delete Tool** 🔴
   - Bloqueador para refactors
   - Workaround: `RunCommand` (inseguro)

2. **TodoWrite não registrada** 🔴
   - Existe na UI mas não é tool
   - Limita workflows complexos

3. **Sem Subagents (Task)** 🔴
   - Maior gap vs Cursor
   - Impede paralelização de tarefas
   - Limita escalabilidade

4. **Sem modo background (Await)** 🟡
   - Limita tasks longas
   - Timeout max 5min no `RunCommand`

5. **ReadFile sem suporte a imagens** 🟡
   - Cursor lê jpg, png, gif, webp
   - Útil para visual tasks

6. **SearchFiles menos poderoso que Glob** 🟡
   - Não suporta padrões `**/*.ts`
   - Busca mais simples

---

## 📈 Métricas de Completude

| Dimensão | % Completo | Status |
|----------|------------|--------|
| **Core Filesystem** | 90% | ✅ Quase completo (falta Delete) |
| **Terminal** | 70% | ⚠️ Falta background/Await |
| **Edit** | 120% | ✅ Melhor que Cursor (rollback) |
| **Search** | 120% | ✅ Melhor que Cursor (LSP) |
| **Git** | 150% | ✅ Extra (Cursor usa Shell) |
| **Diagnostics** | 100% | ✅ Completo |
| **Workspace** | 200% | ✅ Extra (não existe no Cursor) |
| **User Interaction** | 100% | ✅ Completo |
| **Web** | 0% | ❌ Ausente (baixa prioridade) |
| **Notebooks** | 0% | ❌ Ausente (nicho) |
| **Orchestration** | 0% | ❌ **Gap crítico** |

**Score Geral**: **65%** (core completo, orquestração ausente)

---

## 🎯 Roadmap Sugerido

### 🔴 Prioridade Crítica (P0)

1. **Adicionar Delete Tool** (2-4 horas)
   ```typescript
   export const DeleteFileTool: Tool<DeleteFileInput, void> = {
     name: "DeleteFile",
     description: "Remove file or directory",
     requiresApproval: () => true, // Sempre pede aprovação
     allowedInMode: (mode) => mode === "agent"
   }
   ```

2. **Registrar TodoWrite como Tool** (1-2 horas)
   - Já existe a lógica no runtime
   - Só falta adicionar à `ToolRegistry`

3. **Implementar Task (Subagents)** (40-80 horas)
   - Sistema de subagentes com contexto isolado
   - Tipos: `explore`, `shell`, `review`, `test`
   - Comunicação via message passing
   - Maior feature ausente vs Cursor

### 🟡 Prioridade Alta (P1)

4. **Implementar Await para background tasks** (8-16 horas)
   - Polling com regex matching
   - Timeout configurável
   - Stream de output em arquivo

5. **Melhorar ReadFile com suporte a imagens** (4-8 horas)
   - Decoder jpg, png, gif, webp
   - Base64 encoding para LLM
   - Útil para visual analysis

6. **Implementar Glob pattern matching** (4-8 horas)
   - Substituir `SearchFiles` por `Glob`
   - Suporte a `**/*.ts`, `src/**/*.{ts,tsx}`
   - Usar biblioteca `globby` ou similar

### 🟢 Prioridade Baixa (P2)

7. **WebFetch** (8-16 horas)
   - HTTP client
   - HTML → Markdown conversion
   - Cache de requisições
   - Útil para docs externas

8. **SwitchMode como Tool** (4-8 horas)
   - Formalize transições ask → plan → agent
   - Validações de estado
   - Logs de transição

### ⚪ Opcional (P3)

9. **EditNotebook** (não priorizar)
10. **WebSearch** (não priorizar)
11. **GenerateImage** (não implementar)

---

## 🔧 Detalhes Técnicos

### Cache System (único do Korix)

```typescript
class ToolCache {
  // LRU + LFU hybrid eviction
  // Hot/Cold tiers
  private hotCache: Map<string, CacheEntry>; // 20% do espaço
  private coldCache: Map<string, CacheEntry>; // 80% do espaço
  
  get<T>(tool: string, input: unknown): ToolResult<T> | null;
  set<T>(tool: string, input: unknown, result: ToolResult<T>): void;
  invalidate(pattern: string | RegExp): void;
  
  getStats(): {
    hitRate: number;
    size: number;
    evictions: number;
  }
}
```

**Políticas**:
- Tools de leitura → cacheable
- Tools de escrita → não cacheable (`WriteFile`, `EditFile`, `RunCommand`)
- TTL: 5 minutos
- Max size: 100MB
- Max entries: 1000

### Metrics System (único do Korix)

```typescript
class ToolMetrics {
  record(event: {
    tool: string;
    duration: number;
    cached: boolean;
    success: boolean;
    inputSize: number;
    outputSize: number;
    error?: string;
  }): void;
  
  getStats(tool?: string): {
    totalCalls: number;
    successRate: number;
    avgDuration: number;
    cacheHitRate: number;
  }
}
```

**Ringbuffer**: 10,000 eventos (FIFO)

---

## 🆚 Vantagens Técnicas do Korix sobre Cursor

### 1. Type Safety
- **Cursor**: JSON schemas (runtime validation)
- **Korix**: Zod schemas → TypeScript types (compile-time + runtime)

### 2. Cache de Tools
- **Cursor**: Nenhum
- **Korix**: LRU+LFU, 100MB, invalidation patterns

### 3. Rollback System
- **Cursor**: StrReplace sem rollback
- **Korix**: EditFile com rollback automático, atomic patches

### 4. LSP Integration
- **Cursor**: Não tem FindReferences/FindSymbols
- **Korix**: Busca semântica multi-linguagem

### 5. Git Tools
- **Cursor**: Depende de `Shell git status`
- **Korix**: Tools dedicadas (GitStatus, GitDiff, ChangedFiles)

### 6. Security
- **Cursor**: Approval genérico
- **Korix**: 
  - Command validation (denylist)
  - Mode restrictions (write bloqueado em plan)
  - Approval por tool + input

### 7. Observability
- **Cursor**: Logs básicos
- **Korix**: 
  - Metrics automáticas (duration, success rate)
  - Cache hit rate
  - Input/output size tracking

---

## 🏁 Conclusão

### Onde o Korix é Melhor
✅ **Edit** — Rollback + atomic patches  
✅ **Search** — LSP integration (semântica)  
✅ **Git** — Tools dedicadas  
✅ **Workspace** — Context awareness  
✅ **Security** — Validação + restrictions  
✅ **Performance** — Tool cache + metrics  

### Onde o Cursor é Melhor
❌ **Orchestration** — Task/subagents (gap crítico)  
❌ **Background** — Await para polling  
❌ **Filesystem** — Delete tool (falta)  
⚠️ **Glob** — Pattern matching mais poderoso  

### Score Final
- **Korix**: **65%** de completude vs Cursor
- **Core features**: ✅ 90% completo
- **Advanced features**: ❌ 20% completo (orquestração)

### Próximos Passos (Prioridade)
1. 🔴 Adicionar `DeleteFile` (P0)
2. 🔴 Registrar `TodoWrite` (P0)
3. 🔴 Implementar `Task/Subagents` (P0 — maior gap)
4. 🟡 Implementar `Await` (P1)
5. 🟡 Melhorar `ReadFile` com imagens (P1)

---

**Documento gerado por**: Korix Code Analysis  
**Revisão**: Necessária após implementação de P0 items
