# Tools Roadmap — Korix Code

**Data**: 2026-05-19

**Última revisão**: 2026-05-22

**Versão**: 1.2

**Status**: Reconciled — parity cycle implemented, next phase is hardening

---

## 📋 Resumo Executivo

### Objetivo
O ciclo inicial de paridade com Cursor/Claude Code foi implementado em fatias SDD/TDD. O foco agora deixa de ser "adicionar tools ausentes" e passa a ser:

1. **Hardening** — fortalecer cancelamento, limites e cleanup.
2. **Qualidade operacional** — validar uso real, telemetria e falhas.
3. **Confiabilidade de subagents** — impedir vazamento de estado, loops caros e execução sem cleanup.
4. **Paridade útil** — manter qualidade mínima equivalente a Codex/Cursor, com diferencial em SDD/TDD.

### Estado Atual Implementado

O repositório registra atualmente **26 tools** em `src/tools/index.ts`.

Entregas concluídas desde a versão 1.1:

- `DeleteFile` seguro com validação de workspace e aprovação.
- `Await` + background terminal em `RunCommand`.
- suporte a metadados de imagem em `ReadFile`.
- `Glob` coexistindo com `SearchFiles`.
- `WebFetch` seguro com timeout e limites.
- `TodoWrite` integrado ao runtime.
- `Task` tool com subagents `explore`, `plan`, `review`, `shell` e `test`.
- métricas básicas de `SubagentRunner`.
- documentação de subagents.
- enforcement de `maxIterations` e `timeout` por tipo de subagent.

### Métricas Alvo

| Dimensão | Atual | Alvo | Delta |
|----------|-------|------|-------|
| **Tools Registradas** | 26 | 27 | +1 |
| **Core Filesystem** | 100% | 100% | 0 |
| **Terminal** | 95% | 95% | 0 |
| **Orchestration** | 85% | 90% | +5% |
| **Search** | 120% | 120% | - (já superior) |
| **Score Geral** | 90% | 95% | +5% |

### Timeline Reconciliada

- **Sprint 0**: Roadmap Alignment — ✅ concluído.
- **Sprint 1**: DeleteFile + Await/background terminal — ✅ concluído.
- **Sprint 2**: Task/Subagent MVP — ✅ expandido e concluído para 5 tipos.
- **Sprint 3**: ReadFile image metadata + Glob — ✅ concluído.
- **Sprint 4**: WebFetch + TodoWrite + subagent hardening inicial — ✅ concluído.
- **Sprint 5**: Resource limits, cancellation hardening e validation loop — 🔜 próxima fase.

**Próximo objetivo**: sair de "features presentes" para "features confiáveis sob falha, timeout, cancelamento e uso real".

> Nota de revisão 1.2: as seções detalhadas antigas abaixo continuam como registro histórico e referência técnica. O planejamento executável atual é o bloco reconciliado acima e a seção "Próxima Fase Recomendada".

---

## Próxima Fase Recomendada

### Fase 5: Subagent Resource Limits & Cancellation Hardening

**Prioridade**: 🔴 P0

**Tipo**: runtime hardening

**Workflow**: `korix-sdd` com TDD

**Objetivo**: garantir que subagents tenham limites operacionais confiáveis e que timeout/cancelamento limpem execução em andamento de forma previsível.

#### Escopo

- Definir `SubagentResourceLimits` no contrato de subagent.
- Aplicar limites mínimos rastreáveis:
  - máximo de tools por run.
  - máximo de output agregado.
  - deadline/cancel reason preservado no resultado.
- Melhorar propagação de cancelamento do `AgentLoop` para execução cooperativa.
- Registrar nos metadados do `SubagentResult` quando a execução parou por limite.
- Cobrir com Red tests antes de produção.

#### Fora do Escopo

- Pooling de subagents.
- execução paralela de múltiplos subagents.
- streaming de progresso de subagents.
- retry automático sofisticado.
- refactor grande de `ExecutionEngine`.

#### Critérios de Aceitação

- Subagent retorna falha estruturada quando excede limite de tools.
- Subagent retorna falha estruturada quando excede limite de output.
- Timeout mantém erro claro e metadata de cancelamento.
- Testes provam que limites não afetam runs normais.
- Arquivos novos/tocados permanecem abaixo de 500 linhas.

---

## 🧭 Fase 0: Roadmap Alignment (pré-implementação)

**Status**: ✅ Executada como etapa documental antes da primeira implementação

**Objetivo**: Corrigir premissas do roadmap, travar ordem de entrega e evitar começar por uma arquitetura grande demais.

### Decisões Travadas

- Naquele momento, o projeto registrava **20 tools** em `src/tools/index.ts`.
- A primeira implementação será **DeleteFile**, mas somente depois deste alinhamento documental.
- O fluxo de execução deve seguir **TDD**: Red tests → Green implementation → Refactor/verification.
- `DeleteFile` não terá auto-approval por `force` na primeira versão.
- Validação de workspace deve usar `path.resolve` + `path.relative`, não `startsWith`.
- `TodoWrite` fica fora da primeira sequência até haver decisão clara de produto/runtime.
- `Task/Subagents` começa com MVP `explore` read-only, não com 5 tipos de subagentes.
- `SearchFiles` deve coexistir com `Glob`; não será removida/deprecada no primeiro corte.
- `WebFetch` é P2 por risco de rede/segurança.

### Próxima Parada

Concluída. A próxima etapa executável agora é a Fase 5 de hardening de subagents.

### Nota Sobre Seções Posteriores

As seções detalhadas abaixo agora são registro histórico/backlog técnico. Antes de qualquer nova implementação, usar a seção reconciliada da versão 1.2 como fonte primária.

---

## 🚀 Fase 1: Critical Gap Fixes (P0)

**Duração**: 2 semanas
**Esforço**: 24 horas
**Objetivo**: Entregar tools locais críticas com segurança e sem tocar em subagents completos.

---

### 1.1 DeleteFile Tool

**Prioridade**: 🔴 P0
**Esforço**: 4 horas
**Impacto**: Alto — Bloqueador para refactors
**Risco**: Baixo

#### Descrição
Tool para remover arquivos e diretórios com validação de segurança.

#### Implementação

**Arquivo**: `src/tools/filesystem/deleteFile.ts`

```typescript
import * as vscode from "vscode";
import * as path from "path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const DeleteFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to file/directory"),
  recursive: z.boolean().optional().describe("Delete directory recursively"),
});

type DeleteFileInput = z.infer<typeof DeleteFileSchema>;

export const DeleteFileTool: Tool<DeleteFileInput, void> = {
  name: "DeleteFile",
  description: `Remove file or directory from filesystem.

  Security:
  - Requires approval for all deletions
  - Blocked in 'plan' and 'ask' modes
  - Validates path is within workspace
  - Prevents deletion of critical files (.git, node_modules root, etc.)`,

  schema: DeleteFileSchema,

  allowedInMode(mode: "ask" | "plan" | "agent"): boolean {
    return mode === "agent"; // Only in agent mode
  },

  requiresApproval(_input: DeleteFileInput, _context: ToolContext): boolean {
    return true;
  },

  async execute(
    input: DeleteFileInput,
    context: ToolContext,
  ): Promise<ToolResult<void>> {
    try {
      // Normalize path
      const workspaceRoot = path.resolve(context.workspaceRoot);
      const absolutePath = path.resolve(workspaceRoot, input.path);
      const relativePath = path.relative(workspaceRoot, absolutePath);

      // Security: Validate path is within workspace
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return {
          success: false,
          error: "Cannot delete files outside workspace",
          metadata: {
            duration: 0,
            approved: false,
            timestamp: Date.now(),
          },
        };
      }

      // Security: Block critical paths
      if (isCriticalPath(absolutePath, context.workspaceRoot)) {
        return {
          success: false,
          error: "Cannot delete critical files (.git, package.json, etc.)",
          metadata: {
            duration: 0,
            approved: false,
            timestamp: Date.now(),
          },
        };
      }

      const uri = vscode.Uri.file(absolutePath);

      // Check if exists
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        return {
          success: false,
          error: `Path does not exist: ${input.path}`,
          metadata: {
            duration: 0,
            approved: true,
            timestamp: Date.now(),
          },
        };
      }

      // Delete
      const recursive = input.recursive ?? false;
      await vscode.workspace.fs.delete(uri, { recursive, useTrash: true });

      return {
        success: true,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to delete: ${err.message}`,
        metadata: {
          duration: 0,
          approved: false,
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Check if path is critical (never delete)
 */
function isCriticalPath(absolutePath: string, workspaceRoot: string): boolean {
  const criticalPaths = [
    path.join(workspaceRoot, ".git"),
    path.join(workspaceRoot, "package.json"),
    path.join(workspaceRoot, "tsconfig.json"),
    path.join(workspaceRoot, "node_modules"),
    path.join(workspaceRoot, ".env"),
    path.join(workspaceRoot, "pnpm-lock.yaml"),
  ];

  return criticalPaths.some((critical) => {
    const relativePath = path.relative(critical, absolutePath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  });
}
```

#### Testes

**Arquivo**: `src/tools/filesystem/deleteFile.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import { DeleteFileTool } from "./deleteFile";
import type { ToolContext } from "../../harness/toolRegistry";

describe("DeleteFileTool", () => {
  let context: ToolContext;
  const testRoot = "/test/workspace";

  beforeEach(() => {
    context = {
      workspaceRoot: testRoot,
      execution: { mode: "agent" } as ToolContext["execution"],
    };
  });

  it("should delete file within workspace", async () => {
    const input = { path: "test.txt" };
    const result = await DeleteFileTool.execute(input, context);
    expect(result.success).toBe(true);
  });

  it("should block deletion outside workspace", async () => {
    const input = { path: "/etc/passwd" };
    const result = await DeleteFileTool.execute(input, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain("outside workspace");
  });

  it("should block deletion of .git directory", async () => {
    const input = { path: ".git" };
    const result = await DeleteFileTool.execute(input, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain("critical files");
  });

  it("should require approval for normal files", () => {
    const input = { path: "src/index.ts" };
    expect(DeleteFileTool.requiresApproval?.(input, context)).toBe(true);
  });

  it("should require approval even for temp files", () => {
    const input = { path: "tmp/cache.tmp" };
    expect(DeleteFileTool.requiresApproval?.(input, context)).toBe(true);
  });

  it("should use trash for safety", async () => {
    const deleteSpy = vi.spyOn(vscode.workspace.fs, "delete");
    const input = { path: "test.txt" };
    await DeleteFileTool.execute(input, context);
    expect(deleteSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ useTrash: true }),
    );
  });
});
```

#### Checklist de Implementação

- [ ] Criar `src/tools/filesystem/deleteFile.ts`
- [ ] Criar primeiro os testes Red de segurança e permissões
- [ ] Implementar validação de segurança (workspace bounds, critical paths)
- [ ] Usar `path.resolve` + `path.relative` para workspace bounds
- [ ] Adicionar suporte a `useTrash` (VSCode API)
- [ ] Implementar `isCriticalPath()` com lista de arquivos protegidos
- [ ] Criar testes unitários (6+ cenários)
- [ ] Registrar tool em `src/tools/index.ts`
- [ ] Adicionar ao `writeTools` em `toolRegistry.ts` (não cachear)
- [ ] Testar integração com EditFile (refactor que remove arquivos)
- [ ] Documentar em `docs/tools-api.md`

#### Dependências
Nenhuma — pode ser implementado imediatamente

---

### 1.2 TodoWrite Tool Registration

**Prioridade**: 🔴 P0
**Esforço**: 2 horas
**Impacto**: Alto — Feature já existe, só falta expor
**Risco**: Muito Baixo

#### Descrição
A lógica de `TodoWrite` já existe no runtime, mas não está registrada como tool na `ToolRegistry`. Precisa ser exposta para o provider poder chamá-la.

#### Situação Atual

**Existe**:
- `src/core/runtime/userQuestion.ts` — Lógica de questions
- Interface do webview para mostrar todos
- Estado no `RuntimeState`

**Falta**:
- Tool wrapper em `src/tools/todoWrite.ts`
- Registro em `ToolRegistry`

#### Implementação

**Arquivo**: `src/tools/todoWrite.ts`

```typescript
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";

const TodoSchema = z.object({
  content: z.string().min(1),
  status: z.enum(["pending", "in_progress", "completed"]),
  activeForm: z.string().min(1),
});

const TodoWriteSchema = z.object({
  todos: z.array(TodoSchema).min(1).describe("List of todos to update"),
});

type TodoWriteInput = z.infer<typeof TodoWriteSchema>;

interface TodoWriteOutput {
  updatedCount: number;
  todos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
}

export const TodoWriteTool: Tool<TodoWriteInput, TodoWriteOutput> = {
  name: "TodoWrite",
  description: `Update the todo list for the current session.

  Rules:
  - Each todo must have content, status, and activeForm
  - Only ONE todo can be 'in_progress' at a time
  - Mark todo 'completed' immediately after finishing
  - Use 'pending' for todos not yet started

  Example:
  {
    "todos": [
      {
        "content": "Implement DeleteFile tool",
        "status": "completed",
        "activeForm": "Implementing DeleteFile tool"
      },
      {
        "content": "Write tests for DeleteFile",
        "status": "in_progress",
        "activeForm": "Writing tests for DeleteFile"
      },
      {
        "content": "Register tool in ToolRegistry",
        "status": "pending",
        "activeForm": "Registering tool in ToolRegistry"
      }
    ]
  }`,

  schema: TodoWriteSchema,

  allowedInMode(_mode: "ask" | "plan" | "agent"): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: TodoWriteInput,
    context: ToolContext,
  ): Promise<ToolResult<TodoWriteOutput>> {
    try {
      // Validate: Only one in_progress
      const inProgress = input.todos.filter((t) => t.status === "in_progress");
      if (inProgress.length > 1) {
        return {
          success: false,
          error: "Only ONE todo can be 'in_progress' at a time",
          metadata: {
            duration: 0,
            approved: true,
            timestamp: Date.now(),
          },
        };
      }

      // Update runtime state
      // TODO: Access RuntimeState to persist todos
      // For now, just validate and return

      const output: TodoWriteOutput = {
        updatedCount: input.todos.length,
        todos: input.todos.map((t) => ({
          content: t.content,
          status: t.status,
          activeForm: t.activeForm,
        })),
      };

      return {
        success: true,
        data: output,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to update todos: ${err.message}`,
        metadata: {
          duration: 0,
          approved: false,
          timestamp: Date.now(),
        },
      };
    }
  },
};
```

#### Integração com RuntimeState

**Modificar**: `src/core/runtime/runtimeState.ts`

```typescript
// Adicionar método público para atualizar todos
export class RuntimeState {
  // ... existing code ...

  /**
   * Update todos list (called by TodoWrite tool)
   */
  updateTodos(todos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>): void {
    // Validate only one in_progress
    const inProgress = todos.filter(t => t.status === "in_progress");
    if (inProgress.length > 1) {
      throw new Error("Only one todo can be in_progress");
    }

    // Update state
    this.conversationState.todos = todos;

    // Emit event
    this.emit({
      type: "todos_updated",
      timestamp: Date.now(),
      data: { todos },
    });
  }

  getTodos() {
    return this.conversationState.todos ?? [];
  }
}
```

#### Checklist de Implementação

- [ ] Criar `src/tools/todoWrite.ts`
- [ ] Adicionar método `updateTodos()` em `RuntimeState`
- [ ] Emitir evento `todos_updated` para webview
- [ ] Validar regra "only one in_progress"
- [ ] Criar testes unitários
- [ ] Registrar tool em `src/tools/index.ts`
- [ ] Testar via provider call
- [ ] Verificar render no webview

#### Dependências
- Acesso ao `RuntimeState` no contexto do tool
- Evento `todos_updated` no `runtimeEvents.ts`

---

### 1.3 ReadFile Image Support

**Prioridade**: 🔴 P0
**Esforço**: 6 horas
**Impacto**: Médio — Útil para visual tasks
**Risco**: Baixo

#### Descrição
Estender `ReadFile` para suportar leitura de imagens (jpg, png, gif, webp) e retornar base64 ou metadata visual.

#### Implementação

**Modificar**: `src/tools/filesystem.ts`

```typescript
const ReadFileSchema = z.object({
  path: z.string().describe("Absolute or relative path to the file"),
  encoding: z.enum(["utf-8", "utf8", "base64", "image"]).optional(),
  imageMetadata: z.boolean().optional().describe("Return image dimensions/format"),
});

type ReadFileInput = z.infer<typeof ReadFileSchema>;

interface ReadFileOutput {
  content?: string;
  image?: {
    base64: string;
    format: "jpeg" | "png" | "gif" | "webp";
    width: number;
    height: number;
    size: number;
  };
}

export const ReadFileTool: Tool<ReadFileInput, ReadFileOutput> = {
  name: "ReadFile",
  description: `Read file contents (text or image).

  Supports:
  - Text files: utf-8, base64
  - Images: jpeg, png, gif, webp (returns base64 + metadata)

  For images, set encoding='image' to get dimensions and format.`,

  schema: ReadFileSchema,

  async execute(
    input: ReadFileInput,
    context: ToolContext,
  ): Promise<ToolResult<ReadFileOutput>> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.join(context.workspaceRoot, input.path);

      const uri = vscode.Uri.file(absolutePath);
      const content = await vscode.workspace.fs.readFile(uri);

      // Check if image
      const ext = path.extname(absolutePath).toLowerCase();
      const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);

      if (isImage && input.encoding === "image") {
        // Read as image
        const imageInfo = await readImageMetadata(content, ext);

        return {
          success: true,
          data: {
            image: {
              base64: Buffer.from(content).toString("base64"),
              format: imageInfo.format,
              width: imageInfo.width,
              height: imageInfo.height,
              size: content.byteLength,
            },
          },
          metadata: {
            duration: 0,
            approved: true,
            timestamp: Date.now(),
          },
        };
      }

      // Text file
      const encoding = input.encoding ?? "utf-8";
      const text = encoding === "base64"
        ? Buffer.from(content).toString("base64")
        : Buffer.from(content).toString("utf-8");

      return {
        success: true,
        data: { content: text },
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to read file: ${err.message}`,
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Extract image metadata using sharp (optional dependency)
 */
async function readImageMetadata(
  buffer: Uint8Array,
  ext: string,
): Promise<{
  format: "jpeg" | "png" | "gif" | "webp";
  width: number;
  height: number;
}> {
  // Option 1: Use sharp (add as optional dependency)
  // const sharp = require("sharp");
  // const metadata = await sharp(Buffer.from(buffer)).metadata();
  // return { format: metadata.format, width: metadata.width, height: metadata.height };

  // Option 2: Parse headers manually (lightweight)
  const format = ext.slice(1) as "jpeg" | "png" | "gif" | "webp";
  const dimensions = parseImageDimensions(buffer, format);

  return {
    format: format === "jpg" ? "jpeg" : format,
    width: dimensions.width,
    height: dimensions.height,
  };
}

/**
 * Parse image dimensions from headers (no external deps)
 */
function parseImageDimensions(
  buffer: Uint8Array,
  format: string,
): { width: number; height: number } {
  // PNG: bytes 16-23 contain width/height (big-endian)
  if (format === "png") {
    const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
    const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
    return { width, height };
  }

  // JPEG: scan for SOF marker (0xFFC0)
  if (format === "jpeg" || format === "jpg") {
    for (let i = 0; i < buffer.length - 9; i++) {
      if (buffer[i] === 0xff && buffer[i + 1] === 0xc0) {
        const height = (buffer[i + 5] << 8) | buffer[i + 6];
        const width = (buffer[i + 7] << 8) | buffer[i + 8];
        return { width, height };
      }
    }
  }

  // GIF: bytes 6-9 contain width/height (little-endian)
  if (format === "gif") {
    const width = buffer[6] | (buffer[7] << 8);
    const height = buffer[8] | (buffer[9] << 8);
    return { width, height };
  }

  // WebP: complex format, fallback to 0x0
  return { width: 0, height: 0 };
}
```

#### Checklist de Implementação

- [ ] Estender `ReadFileSchema` com `encoding: "image"`
- [ ] Implementar `parseImageDimensions()` para PNG, JPEG, GIF
- [ ] Adicionar suporte WebP (opcional)
- [ ] Criar testes para cada formato de imagem
- [ ] Atualizar output type para `ReadFileOutput` (union)
- [ ] Documentar formato de resposta para imagens
- [ ] Testar com provider (verificar se base64 é consumível)
- [ ] Adicionar exemplo no description

#### Dependências
- Nenhuma (parser manual de headers)
- Opcional: `sharp` package para metadata avançada

---

## 🎯 Fase 2: Advanced Features (P1)

**Duração**: 2 semanas
**Esforço**: 40 horas
**Objetivo**: Melhorar capabilities avançadas

---

### 2.1 Await Tool (Background Polling)

**Prioridade**: 🟡 P1
**Esforço**: 12 horas
**Impacto**: Médio — Permite tasks longas
**Risco**: Médio (sincronização complexa)

#### Descrição
Tool para esperar/pollar output de comandos em background com regex matching e timeout.

#### Design

**Casos de uso**:
1. `RunCommand` com `background: true` retorna `sessionId`
2. `Await` pollando `sessionId` até regex match
3. Timeout configurável
4. Stream de output em arquivo temporário

#### Implementação

**Modificar**: `src/tools/terminal.ts`

```typescript
const RunCommandInputSchema = z.object({
  command: z.string().min(1),
  sessionId: z.string().optional(),
  timeout: z.number().optional(),
  cwd: z.string().optional(),
  background: z.boolean().optional().describe("Run in background, return immediately"),
});

interface RunCommandOutput {
  stdout: string;
  sessionId?: string;
  background?: boolean;
}
```

**Novo arquivo**: `src/tools/terminal/await.ts`

```typescript
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";
import type { CommandRunner } from "../../terminal/commandRunner";
import { getGlobalContainer } from "../../di/container";
import { TOKENS } from "../../di/tokens";

const AwaitSchema = z.object({
  sessionId: z.string().describe("Background session ID from RunCommand"),
  pattern: z.string().optional().describe("Regex pattern to wait for"),
  timeout: z.number().optional().describe("Timeout in ms (default: 60000)"),
  pollInterval: z.number().optional().describe("Poll interval in ms (default: 1000)"),
});

type AwaitInput = z.infer<typeof AwaitSchema>;

interface AwaitOutput {
  matched: boolean;
  output: string;
  exitCode?: number;
  duration: number;
}

export const AwaitTool: Tool<AwaitInput, AwaitOutput> = {
  name: "Await",
  description: `Wait for background command to complete or match pattern.

  Usage:
  1. Start background command: RunCommand({ command: "npm test", background: true })
  2. Wait for result: Await({ sessionId: "xyz", pattern: "Tests passed" })

  Returns immediately when:
  - Pattern is matched in output
  - Command exits
  - Timeout is reached`,

  schema: AwaitSchema,

  allowedInMode(_mode): boolean {
    return true;
  },

  async execute(
    input: AwaitInput,
    _context: ToolContext,
  ): Promise<ToolResult<AwaitOutput>> {
    const startTime = Date.now();
    const timeout = input.timeout ?? 60000; // 1 minute default
    const pollInterval = input.pollInterval ?? 1000; // 1 second
    const pattern = input.pattern ? new RegExp(input.pattern) : null;

    const container = getGlobalContainer();
    const commandRunner = container.get<CommandRunner>(TOKENS.CommandRunner);

    try {
      let elapsed = 0;
      let matched = false;
      let output = "";
      let exitCode: number | undefined;

      while (elapsed < timeout) {
        // Poll session status
        const status = await commandRunner.getSessionStatus(input.sessionId);

        if (!status) {
          return {
            success: false,
            error: `Session not found: ${input.sessionId}`,
            metadata: {
              duration: Date.now() - startTime,
              approved: true,
              timestamp: startTime,
            },
          };
        }

        output = status.output;
        exitCode = status.exitCode;

        // Check pattern match
        if (pattern && pattern.test(output)) {
          matched = true;
          break;
        }

        // Check if command exited
        if (status.exited) {
          break;
        }

        // Sleep
        await sleep(pollInterval);
        elapsed = Date.now() - startTime;
      }

      const timedOut = elapsed >= timeout && !matched;

      return {
        success: !timedOut,
        data: {
          matched,
          output,
          exitCode,
          duration: elapsed,
        },
        error: timedOut ? "Timeout waiting for pattern" : undefined,
        metadata: {
          duration: elapsed,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Await failed: ${err.message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Modificar**: `src/terminal/commandRunner.ts`

```typescript
export interface CommandRunner {
  // ... existing methods ...

  /**
   * Get status of background session
   */
  getSessionStatus(sessionId: string): Promise<{
    output: string;
    exitCode?: number;
    exited: boolean;
  } | null>;
}

// Implementation
export class CommandRunnerImpl implements CommandRunner {
  private sessions = new Map<string, BackgroundSession>();

  async run(
    command: string,
    options?: { sessionId?: string; timeout?: number; cwd?: string; background?: boolean }
  ): Promise<RunResult> {
    if (options?.background) {
      const sessionId = options.sessionId ?? generateId();
      const session = this.startBackgroundSession(command, sessionId, options);
      this.sessions.set(sessionId, session);

      return {
        stdout: "",
        sessionId,
        duration: 0,
        timedOut: false,
      };
    }

    // Normal synchronous execution
    return this.runSync(command, options);
  }

  async getSessionStatus(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      output: session.output,
      exitCode: session.exitCode,
      exited: session.exited,
    };
  }

  private startBackgroundSession(
    command: string,
    sessionId: string,
    options: { timeout?: number; cwd?: string }
  ): BackgroundSession {
    const session: BackgroundSession = {
      id: sessionId,
      output: "",
      exitCode: undefined,
      exited: false,
    };

    const proc = spawn("bash", ["-c", command], {
      cwd: options.cwd,
      shell: true,
    });

    proc.stdout.on("data", (data) => {
      session.output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      session.output += data.toString();
    });

    proc.on("exit", (code) => {
      session.exitCode = code ?? undefined;
      session.exited = true;
    });

    // Cleanup after timeout
    setTimeout(() => {
      if (!session.exited) {
        proc.kill();
        session.exited = true;
      }
      this.sessions.delete(sessionId);
    }, options.timeout ?? 300000); // 5 min default

    return session;
  }
}

interface BackgroundSession {
  id: string;
  output: string;
  exitCode?: number;
  exited: boolean;
}
```

#### Checklist de Implementação

- [ ] Adicionar `background: boolean` ao `RunCommandInput`
- [ ] Implementar `startBackgroundSession()` em `CommandRunner`
- [ ] Criar `BackgroundSession` interface com output buffer
- [ ] Implementar `getSessionStatus()` em `CommandRunner`
- [ ] Criar `src/tools/terminal/await.ts`
- [ ] Implementar polling loop com regex matching
- [ ] Adicionar timeout com cleanup
- [ ] Testes para background sessions
- [ ] Testes para Await com pattern matching
- [ ] Registrar `AwaitTool` em `src/tools/index.ts`

#### Dependências
- Modificação em `CommandRunner`
- Session management (Map de sessions ativas)

---

### 2.2 Glob Pattern Matching

**Prioridade**: 🟡 P1
**Esforço**: 6 horas
**Impacto**: Médio — Melhor DX
**Risco**: Baixo

#### Descrição
Substituir `SearchFiles` por `Glob` com suporte a padrões avançados (`**/*.ts`, `src/**/*.{tsx,ts}`).

#### Implementação

**Arquivo**: `src/tools/filesystem/glob.ts`

```typescript
import { glob } from "glob"; // npm install glob
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const GlobSchema = z.object({
  pattern: z.string().describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.{ts,tsx}')"),
  ignore: z.array(z.string()).optional().describe("Patterns to ignore"),
  maxResults: z.number().optional().describe("Max results (default: 1000)"),
  followSymlinks: z.boolean().optional(),
});

type GlobInput = z.infer<typeof GlobSchema>;

export const GlobTool: Tool<GlobInput, string[]> = {
  name: "Glob",
  description: `Find files matching glob patterns.

  Patterns:
  - **/*.ts — All TypeScript files recursively
  - src/**/*.{ts,tsx} — TypeScript files in src/
  - !node_modules/** — Exclude node_modules

  Examples:
  - Find all tests: "**/*.test.ts"
  - Find components: "src/components/**/*.tsx"
  - Exclude dist: Use ignore: ["dist/**"]`,

  schema: GlobSchema,

  allowedInMode(_mode): boolean {
    return true;
  },

  async execute(
    input: GlobInput,
    context: ToolContext,
  ): Promise<ToolResult<string[]>> {
    const startTime = Date.now();

    try {
      const results = await glob(input.pattern, {
        cwd: context.workspaceRoot,
        ignore: input.ignore ?? ["node_modules/**", ".git/**"],
        absolute: false,
        followSymbolicLinks: input.followSymlinks ?? false,
      });

      // Limit results
      const maxResults = input.maxResults ?? 1000;
      const limited = results.slice(0, maxResults);

      return {
        success: true,
        data: limited,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Glob failed: ${err.message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};
```

#### Checklist de Implementação

- [ ] Adicionar dependency: `pnpm add glob`
- [ ] Criar `src/tools/filesystem/glob.ts`
- [ ] Implementar com `glob` package
- [ ] Default ignore: `node_modules`, `.git`
- [ ] Limitar resultados (max 1000)
- [ ] Testes com padrões complexos (`**/*.{ts,tsx}`)
- [ ] Registrar tool e remover `SearchFiles` (deprecated)
- [ ] Atualizar docs

---

### 2.3 WebFetch Tool

**Prioridade**: 🟢 P2
**Esforço**: 10 horas
**Impacto**: Baixo — Nice to have
**Risco**: Médio (parsing HTML)

#### Descrição
Fetch conteúdo de URLs e converter HTML para Markdown legível.

#### Implementação

**Arquivo**: `src/tools/web/webFetch.ts`

```typescript
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";
import TurndownService from "turndown"; // npm install turndown

const WebFetchSchema = z.object({
  url: z.string().url().describe("URL to fetch"),
  timeout: z.number().optional().describe("Timeout in ms (default: 10000)"),
  followRedirects: z.boolean().optional(),
});

type WebFetchInput = z.infer<typeof WebFetchSchema>;

interface WebFetchOutput {
  markdown: string;
  url: string;
  statusCode: number;
  contentType: string;
}

export const WebFetchTool: Tool<WebFetchInput, WebFetchOutput> = {
  name: "WebFetch",
  description: `Fetch content from URL and convert to Markdown.

  Supports:
  - HTML pages (converts to Markdown)
  - JSON responses (pretty-printed)
  - Plain text

  Use cases:
  - Read API documentation
  - Fetch library docs
  - Get content from web pages`,

  schema: WebFetchSchema,

  allowedInMode(_mode): boolean {
    return true;
  },

  async execute(
    input: WebFetchInput,
    _context: ToolContext,
  ): Promise<ToolResult<WebFetchOutput>> {
    const startTime = Date.now();
    const timeout = input.timeout ?? 10000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(input.url, {
        signal: controller.signal,
        redirect: input.followRedirects ? "follow" : "manual",
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") ?? "text/plain";
      const text = await response.text();

      let markdown: string;

      if (contentType.includes("text/html")) {
        // Convert HTML to Markdown
        const turndown = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
        });
        markdown = turndown.turndown(text);
      } else if (contentType.includes("application/json")) {
        // Pretty-print JSON
        const json = JSON.parse(text);
        markdown = "```json\n" + JSON.stringify(json, null, 2) + "\n```";
      } else {
        // Plain text
        markdown = text;
      }

      return {
        success: true,
        data: {
          markdown,
          url: input.url,
          statusCode: response.status,
          contentType,
        },
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `WebFetch failed: ${err.message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};
```

#### Checklist

- [ ] Adicionar dependency: `pnpm add turndown @types/turndown`
- [ ] Implementar fetch com AbortController (timeout)
- [ ] HTML → Markdown usando Turndown
- [ ] Pretty-print JSON
- [ ] Testes com mock fetch
- [ ] Cache de requisições (opcional)
- [ ] Registrar tool

---

## 🏗️ Fase 3: Subagents System (P0 — Maior Gap)

**Duração**: 4 semanas
**Esforço**: 80 horas
**Objetivo**: Implementar sistema de subagentes — maior feature ausente vs Cursor

---

### 3.1 Task Tool & Subagent Architecture

**Prioridade**: 🔴 P0
**Esforço**: 80 horas
**Impacto**: Crítico — Escalabilidade
**Risco**: Alto (complexidade arquitetural)

#### Descrição
Sistema completo de subagentes com isolamento de contexto, tipos especializados, e comunicação assíncrona.

#### Arquitetura

```
┌─────────────────────────────────────────────────┐
│           Main Agent (Parent)                   │
│  - RuntimeState                                 │
│  - ToolRegistry                                 │
│  - ExecutionEngine                              │
└─────────────┬───────────────────────────────────┘
              │
              │ spawns
              ▼
┌─────────────────────────────────────────────────┐
│         Subagent (Child)                        │
│  - Isolated RuntimeState                        │
│  - Subset of Tools                              │
│  - Type-specific capabilities                   │
│  - Message passing to parent                    │
└─────────────────────────────────────────────────┘
```

#### Tipos de Subagentes

1. **explore** — Exploração de codebase
   - Tools: ReadFile, Grep, FindReferences, FindSymbols, ListDirectory
   - Prompt: "Find all references to X"
   - Output: Lista de arquivos/linhas

2. **shell** — Comandos longos em background
   - Tools: RunCommand, Await
   - Prompt: "Run tests and report failures"
   - Output: Command output + summary

3. **review** — Code review automatizado
   - Tools: ReadFile, GitDiff, Grep
   - Prompt: "Review PR #123 for security issues"
   - Output: Lista de issues

4. **test** — Execução de testes
   - Tools: RunCommand, ReadFile (test results)
   - Prompt: "Run unit tests for module X"
   - Output: Pass/fail + coverage

5. **plan** — Planning/design
   - Tools: ReadFile, Grep, WorkspaceGraph
   - Prompt: "Design architecture for feature X"
   - Output: Markdown plan

#### Implementação

**Fase 3.1.1: Core Subagent Infrastructure** (30h)

**Arquivo**: `src/core/subagent/subagentTypes.ts`

```typescript
export type SubagentType = "explore" | "shell" | "review" | "test" | "plan";

export interface SubagentConfig {
  readonly type: SubagentType;
  readonly allowedTools: readonly string[];
  readonly maxIterations: number;
  readonly timeout: number; // ms
  readonly isolated: boolean; // Isolated RuntimeState?
}

export const SUBAGENT_CONFIGS: Record<SubagentType, SubagentConfig> = {
  explore: {
    type: "explore",
    allowedTools: ["ReadFile", "Grep", "FindReferences", "FindSymbols", "ListDirectory", "Glob"],
    maxIterations: 10,
    timeout: 60000, // 1 min
    isolated: true,
  },
  shell: {
    type: "shell",
    allowedTools: ["RunCommand", "Await"],
    maxIterations: 5,
    timeout: 300000, // 5 min
    isolated: true,
  },
  review: {
    type: "review",
    allowedTools: ["ReadFile", "GitDiff", "GitStatus", "Grep", "ChangedFiles"],
    maxIterations: 15,
    timeout: 120000, // 2 min
    isolated: true,
  },
  test: {
    type: "test",
    allowedTools: ["RunCommand", "ReadFile", "Await"],
    maxIterations: 8,
    timeout: 600000, // 10 min
    isolated: true,
  },
  plan: {
    type: "plan",
    allowedTools: ["ReadFile", "Grep", "WorkspaceGraph", "FindReferences"],
    maxIterations: 20,
    timeout: 180000, // 3 min
    isolated: false, // Share parent state
  },
};
```

**Arquivo**: `src/core/subagent/subagentRunner.ts`

```typescript
import type { SubagentType, SubagentConfig } from "./subagentTypes";
import { SUBAGENT_CONFIGS } from "./subagentTypes";
import { RuntimeState } from "../runtime/runtimeState";
import { ExecutionEngine } from "../runtime/executionEngine";
import { ToolRegistry } from "../../harness/toolRegistry";
import type { Provider } from "../../providers/types";

export interface SubagentRequest {
  readonly type: SubagentType;
  readonly prompt: string;
  readonly context?: Record<string, unknown>;
  readonly parentStateSnapshot?: unknown; // Optional parent state
}

export interface SubagentResult {
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly duration: number;
  readonly error?: string;
  readonly metadata?: {
    toolsCalled: string[];
    tokensUsed?: number;
  };
}

export class SubagentRunner {
  constructor(
    private readonly provider: Provider,
    private readonly parentRegistry: ToolRegistry,
  ) {}

  async run(request: SubagentRequest): Promise<SubagentResult> {
    const startTime = Date.now();
    const config = SUBAGENT_CONFIGS[request.type];

    try {
      // Create isolated context
      const subagentState = this.createSubagentState(config, request);
      const subagentRegistry = this.createSubagentRegistry(config);
      const engine = new ExecutionEngine(
        subagentState,
        subagentRegistry,
        this.provider,
      );

      // Run subagent loop
      const result = await engine.run({
        userMessage: request.prompt,
        maxIterations: config.maxIterations,
        timeout: config.timeout,
      });

      return {
        success: result.success,
        output: result.finalOutput ?? "",
        iterations: result.iterations,
        duration: Date.now() - startTime,
        metadata: {
          toolsCalled: result.toolsCalled ?? [],
          tokensUsed: result.tokensUsed,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        output: "",
        iterations: 0,
        duration: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  private createSubagentState(
    config: SubagentConfig,
    request: SubagentRequest,
  ): RuntimeState {
    if (config.isolated) {
      // Isolated state
      return new RuntimeState({
        mode: "agent",
        systemPrompt: this.buildSubagentPrompt(request.type),
      });
    } else {
      // Shared state (load from parent snapshot)
      // TODO: Implement state restoration
      return new RuntimeState({
        mode: "plan",
        systemPrompt: this.buildSubagentPrompt(request.type),
      });
    }
  }

  private createSubagentRegistry(config: SubagentConfig): ToolRegistry {
    const registry = new ToolRegistry();

    // Register only allowed tools
    for (const toolName of config.allowedTools) {
      const tool = this.parentRegistry.get(toolName);
      if (tool) {
        registry.register(tool);
      }
    }

    return registry;
  }

  private buildSubagentPrompt(type: SubagentType): string {
    const prompts: Record<SubagentType, string> = {
      explore: `You are an exploration subagent. Your job is to search the codebase and find relevant information.

      Tools available: ReadFile, Grep, FindReferences, FindSymbols, ListDirectory, Glob

      Focus on:
      - Finding files and symbols
      - Exploring directory structure
      - Locating references and usages

      Be concise and return findings in structured format.`,

      shell: `You are a shell execution subagent. Run commands and report results.

      Tools available: RunCommand, Await

      Focus on:
      - Executing commands safely
      - Waiting for completion
      - Reporting errors and output

      Always validate commands before running.`,

      review: `You are a code review subagent. Analyze code for quality, security, and best practices.

      Tools available: ReadFile, GitDiff, GitStatus, Grep, ChangedFiles

      Focus on:
      - Security vulnerabilities
      - Code quality issues
      - Convention violations
      - Performance problems

      Return structured list of issues with severity.`,

      test: `You are a test execution subagent. Run tests and report results.

      Tools available: RunCommand, ReadFile, Await

      Focus on:
      - Running test suites
      - Parsing test output
      - Reporting failures with details
      - Coverage analysis

      Return pass/fail summary with failure details.`,

      plan: `You are a planning subagent. Design implementation strategies.

      Tools available: ReadFile, Grep, WorkspaceGraph, FindReferences

      Focus on:
      - Understanding existing architecture
      - Identifying dependencies
      - Designing implementation steps
      - Considering edge cases

      Return structured plan in Markdown.`,
    };

    return prompts[type];
  }
}
```

**Fase 3.1.2: Task Tool** (10h)

**Arquivo**: `src/tools/task.ts`

```typescript
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import { SubagentRunner } from "../core/subagent/subagentRunner";
import type { SubagentType } from "../core/subagent/subagentTypes";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const TaskSchema = z.object({
  type: z.enum(["explore", "shell", "review", "test", "plan"]),
  prompt: z.string().min(1).describe("Task prompt for subagent"),
  context: z.record(z.unknown()).optional(),
  async: z.boolean().optional().describe("Run in background (default: false)"),
});

type TaskInput = z.infer<typeof TaskSchema>;

interface TaskOutput {
  success: boolean;
  output: string;
  iterations: number;
  duration: number;
  taskId?: string; // For async tasks
}

export const TaskTool: Tool<TaskInput, TaskOutput> = {
  name: "Task",
  description: `Launch a specialized subagent for focused work.

  Types:
  - explore: Search codebase, find files/symbols
  - shell: Run long commands in background
  - review: Code review for security/quality
  - test: Execute test suites
  - plan: Design implementation strategy

  Example:
  {
    "type": "explore",
    "prompt": "Find all usages of UserService class"
  }

  Subagents run in isolated context with limited tools.
  Results are returned to parent agent.`,

  schema: TaskSchema,

  allowedInMode(mode): boolean {
    return mode === "agent"; // Only in agent mode
  },

  async execute(
    input: TaskInput,
    context: ToolContext,
  ): Promise<ToolResult<TaskOutput>> {
    const container = getGlobalContainer();
    const provider = container.get(TOKENS.Provider);
    const parentRegistry = container.get(TOKENS.ToolRegistry);

    const runner = new SubagentRunner(provider, parentRegistry);

    if (input.async) {
      // Background execution
      const taskId = generateTaskId();

      // Fire and forget
      runner.run({
        type: input.type as SubagentType,
        prompt: input.prompt,
        context: input.context,
      }).then((result) => {
        // Store result for later retrieval
        storeTaskResult(taskId, result);
      });

      return {
        success: true,
        data: {
          success: true,
          output: "",
          iterations: 0,
          duration: 0,
          taskId,
        },
        metadata: {
          duration: 0,
          approved: true,
          timestamp: Date.now(),
        },
      };
    }

    // Synchronous execution
    const result = await runner.run({
      type: input.type as SubagentType,
      prompt: input.prompt,
      context: input.context,
    });

    return {
      success: result.success,
      data: {
        success: result.success,
        output: result.output,
        iterations: result.iterations,
        duration: result.duration,
      },
      error: result.error,
      metadata: {
        duration: result.duration,
        approved: true,
        timestamp: Date.now(),
      },
    };
  },
};

let taskCounter = 0;
function generateTaskId(): string {
  return `task-${Date.now()}-${++taskCounter}`;
}

const taskResults = new Map<string, unknown>();
function storeTaskResult(taskId: string, result: unknown): void {
  taskResults.set(taskId, result);
}
```

**Fase 3.1.3: Testes & Integração** (20h)

```typescript
// src/core/subagent/subagentRunner.test.ts
describe("SubagentRunner", () => {
  it("should run explore subagent with isolated context", async () => {
    const runner = new SubagentRunner(mockProvider, mockRegistry);
    const result = await runner.run({
      type: "explore",
      prompt: "Find UserService class",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("UserService");
  });

  it("should respect tool restrictions", async () => {
    // explore subagent should not have WriteFile
    const result = await runner.run({
      type: "explore",
      prompt: "Write file test.txt",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tool not allowed");
  });

  it("should timeout after configured duration", async () => {
    const result = await runner.run({
      type: "explore",
      prompt: "Sleep forever",
    });

    expect(result.duration).toBeLessThanOrEqual(60000); // 1 min timeout
  });
});
```

**Fase 3.1.4: Otimizações** (20h)

- [ ] Subagent pooling (reuse contexts)
- [ ] State serialization (parent → child)
- [ ] Result streaming (progress updates)
- [ ] Resource limits (memory, CPU)
- [ ] Metrics (subagent performance)
- [ ] Error recovery (retry logic)

#### Checklist de Implementação

**Week 1-2: Core Infrastructure**
- [ ] Criar `src/core/subagent/` directory
- [ ] Implementar `SubagentRunner`
- [ ] Definir `SubagentConfig` para cada tipo
- [ ] System prompts especializados
- [ ] Isolated ToolRegistry per subagent
- [ ] Isolated RuntimeState per subagent

**Week 3: Task Tool**
- [ ] Implementar `TaskTool`
- [ ] Sync execution
- [ ] Async execution (background)
- [ ] Task ID generation
- [ ] Result storage

**Week 4: Testes & Polish**
- [ ] Testes unitários (15+ cenários)
- [ ] Testes de integração (end-to-end)
- [ ] Timeout handling
- [ ] Error handling
- [ ] Metrics collection
- [ ] Documentação

#### Dependências
- Refactor `ExecutionEngine` para aceitar custom ToolRegistry
- State serialization/deserialization
- Provider interface estável

---

## 📊 Tracking & Metrics

### Sprint Velocity

| Sprint | Items | Horas Planejadas | Horas Reais | Status |
|--------|-------|------------------|-------------|--------|
| Sprint 0 | Roadmap Alignment | 2h | TBD | ✅ Concluído |
| Sprint 1 | DeleteFile, Await/background terminal | 24h | TBD | ✅ Concluído |
| Sprint 2 | Task/Subagent MVP | 32h | TBD | ✅ Concluído e expandido |
| Sprint 3 | ReadFile image metadata, Glob | 28h | TBD | ✅ Concluído |
| Sprint 4 | WebFetch, TodoWrite, subagent hardening inicial | TBD | TBD | ✅ Concluído |
| Sprint 5 | Resource limits + cancellation hardening | TBD | TBD | 🔜 Próximo |

### Milestones

- [x] **M0**: Roadmap alinhado antes da implementação — Semana 0
- [x] **M1**: DeleteFile seguro + Await/background — concluído
- [x] **M2**: Subagent MVP (`explore`) — concluído e expandido
- [x] **M3**: ReadFile image metadata + Glob coexistente — concluído
- [x] **M4**: TodoWrite/WebFetch/subagent hardening inicial — concluído
- [ ] **M5**: Resource limits + cancellation hardening — próximo
- [ ] **M6**: Parity 95% com Cursor — após validação de uso real

---

## ⚠️ Riscos & Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Subagents complexos demais** | Alta | Alto | MVP incremental — começar só com explore |
| **Performance ruim (subagents)** | Média | Alto | Pooling + reuse de contextos |
| **State leakage entre subagents** | Média | Médio | Testes rigorosos de isolamento |
| **Timeout issues (Await)** | Média | Médio | Polling interval adaptativo |
| **Image parsing falha** | Baixa | Baixo | Fallback para sharp package |
| **Glob patterns incorretos** | Baixa | Baixo | Usar biblioteca battle-tested (glob) |

---

## 🎯 Critérios de Sucesso

### Fase 1 (P0)
- [x] DeleteFile implementado e testado
- [x] Await funciona com background commands
- [x] Zero regressões em tools existentes

### Fase 2 (P1)
- [x] Task/Subagent `explore` read-only funcional
- [x] Isolamento de registry validado
- [x] Timeout e error handling no MVP

### Fase 3 (P0)
- [x] ReadFile suporta metadata de imagens
- [x] Glob coexiste com SearchFiles
- [x] Performance básica validada por testes

### Overall
- [ ] Score de completude: **90% → 95%**
- [ ] Tools registradas: **26 → 27**
- [ ] Testes passando: baseline atual + testes das novas tools
- [ ] Zero tools deprecated sem replacement

---

## 📚 Referências

### Documentação
- [tools-comparison.md](./tools-comparison.md) — Análise comparativa
- [runtime.md](./runtime.md) — Arquitetura do runtime
- Cursor/Claude Code tools — Referência de API

### Código
- `src/harness/toolRegistry.ts` — Sistema de registro
- `src/core/runtime/executionEngine.ts` — Loop de execução
- `src/tools/` — Implementações existentes

### Bibliotecas
- `glob` — Pattern matching
- `turndown` — HTML → Markdown
- `sharp` (opcional) — Image metadata

---

**Roadmap gerado por**: Korix Code Planning
**Próxima revisão**: Após M1 (Semana 1)
**Owner**: Core Team
