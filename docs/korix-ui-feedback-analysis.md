# Análise de Feedback UI: Claude Code vs Korix Code

## 🎯 Objetivo
Implementar feedback rico e granular no Korix Code, similar ao Claude Code oficial.

---

## 📊 Componentes Identificados no Claude Code Oficial

### 1. **Status Timer em Tempo Real**
```
"Working for 59s"
```
- **Localização**: Topo do chat
- **Comportamento**: 
  - Atualiza a cada segundo durante execução
  - Mostra tempo decorrido desde início da iteração
  - Desaparece quando completo

**Status Atual Korix**: ❌ Não implementado
**Prioridade**: 🔴 ALTA

---

### 2. **Blocos Colapsáveis de Ações**
```
▼ Explored 3 files, 1 list
  • Read AGENTS.md
  • Read _quick-reference.md
  • Read package.json
  • Listed files in src
```

**Características**:
- Ícone de expand/collapse (▼/▶)
- Resumo no header (X files, Y lists)
- Lista detalhada quando expandido
- Agrupa ações relacionadas (múltiplos `Read` em um bloco)

**Status Atual Korix**: ⚠️ **Parcialmente implementado**
- ✅ Temos `ExecutionTimeline` com expand/collapse
- ✅ Mostra contador de ferramentas
- ❌ Não agrupa ações relacionadas
- ❌ Não mostra "Explored X files" dinamicamente

**Prioridade**: 🟠 MÉDIA-ALTA

---

### 3. **Indicador de Ação em Andamento**
```
🔄 Reading types.ts
```

**Características**:
- Ícone animado (spinner)
- Mostra ferramenta **atual** sendo executada
- Atualiza em tempo real
- Aparece DURANTE a execução, não depois

**Status Atual Korix**: ❌ Não implementado
- Nosso `ToolExecutionItem` só mostra após conclusão
- Não temos indicador de "executando agora"

**Prioridade**: 🔴 ALTA

---

### 4. **Tipos de Ação Diferentes**

Claude Code diferencia visualmente:

| Tipo | Exemplo | Icon/Style |
|------|---------|------------|
| **Explore** | "Explored 19 files" | Agrupado, count |
| **Read** | "Read types.ts" | Individual |
| **Search** | "Searched for ContextEngine..." | Individual, query truncada |
| **List** | "Listed files in src" | Individual |

**Status Atual Korix**: ⚠️ **Parcialmente implementado**
- ✅ Mostramos nome da tool (ReadFile, Grep, etc)
- ❌ Não temos ícones específicos por tipo
- ❌ Não agrupamos leituras múltiplas em "Explored X files"

**Prioridade**: 🟡 MÉDIA

---

### 5. **Feedback de Texto do Assistente**

Claude Code alterna entre:
1. **Texto explicativo** (o que vai fazer)
2. **Blocos de ação** (ferramentas executadas)
3. **Texto de conclusão** (resultado)

**Status Atual Korix**: ✅ **Já temos**
- Mensagens de texto do assistant
- ExecutionTimeline separada

**Prioridade**: ✅ OK

---

## 🎨 Proposta de Implementação

### Phase 1: Real-time Status (ALTA)
- [ ] Componente `<ExecutionTimer />` no topo do chat
- [ ] Hook `useExecutionTimer()` para contar tempo
- [ ] Mostrar "Korix executando por Xs"
- [ ] Esconder quando execução termina

### Phase 2: Current Action Indicator (ALTA)
- [ ] Componente `<CurrentAction />` 
- [ ] Mostrar tool atual com spinner
- [ ] Atualizar em tempo real via events
- [ ] "🔄 Lendo arquivo.ts" / "🔄 Buscando por..." / "🔄 Executando comando..."

### Phase 3: Action Grouping (MÉDIA-ALTA)
- [ ] Lógica para agrupar tools relacionadas
- [ ] "Explored 5 files" quando múltiplos `ReadFile` consecutivos
- [ ] "Searched 3 patterns" quando múltiplos `Grep` consecutivos
- [ ] Header com count + expanded list

### Phase 4: Visual Polish (MÉDIA)
- [ ] Ícones específicos por tipo de tool:
  - 📄 ReadFile
  - 🔍 Grep / FindReferences
  - 📋 ListDirectory
  - ⚙️ RunCommand
  - ✏️ EditFile
- [ ] Cores diferentes por categoria (read vs write vs search)
- [ ] Animações de entrada/saída

---

## 📐 Estrutura de Dados

### Event Stream Enhancement

Adicionar ao `RuntimeEvent`:

```typescript
// Novo event type
type RuntimeEvent = 
  | { type: "execution_progress"; elapsed: number; currentTool?: string }
  | ... existing events

// Adicionar ao execution state
interface ExecutionState {
  startTime: number;
  currentTool?: {
    name: string;
    description: string;
    startedAt: number;
  };
}
```

### Tool Grouping Logic

```typescript
interface ToolGroup {
  type: 'explore' | 'search' | 'execute' | 'single';
  count: number;
  tools: ToolExecution[];
  collapsed: boolean;
}

function groupTools(tools: ToolExecution[]): ToolGroup[] {
  // Group consecutive ReadFile/ListDirectory as "Explored"
  // Group consecutive Grep/FindReferences as "Searched"
  // Others stay single
}
```

---

## 🏗️ Componentes Novos

### 1. `<ExecutionTimer />`
```tsx
// src/webview/components/chat/ExecutionTimer.tsx
export default function ExecutionTimer() {
  const isExecuting = useStore(s => s.isExecuting);
  const startTime = useStore(s => s.executionStartTime);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isExecuting) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [isExecuting, startTime]);

  if (!isExecuting) return null;

  return (
    <div className="text-xs opacity-50 px-3 py-1">
      Korix executando por {Math.floor(elapsed / 1000)}s
    </div>
  );
}
```

### 2. `<CurrentActionBadge />`
```tsx
// src/webview/components/chat/CurrentActionBadge.tsx
export default function CurrentActionBadge() {
  const currentTool = useStore(s => s.currentTool);

  if (!currentTool) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vscode-inputValidation-infoBackground)] rounded">
      <Spinner />
      <span className="text-sm">{currentTool.description}</span>
    </div>
  );
}
```

### 3. `<GroupedToolTimeline />`
```tsx
// src/webview/components/chat/GroupedToolTimeline.tsx
export default function GroupedToolTimeline({ tools }: Props) {
  const groups = groupTools(tools);

  return (
    <div>
      {groups.map(group => (
        group.type === 'single' 
          ? <ToolExecutionItem key={group.tools[0].id} tool={group.tools[0]} />
          : <ToolGroup key={group.tools[0].id} group={group} />
      ))}
    </div>
  );
}
```

---

## 🚀 Roadmap de Implementação

### Sprint 1 (2-3 dias)
- [ ] ExecutionTimer component
- [ ] Add `executionStartTime` to store
- [ ] Hook `useExecutionTimer`
- [ ] Testes unitários

### Sprint 2 (2-3 dias)
- [ ] CurrentActionBadge component
- [ ] Track current tool in RuntimeState
- [ ] Emit `execution_progress` events
- [ ] Update webview store
- [ ] Testes unitários

### Sprint 3 (3-4 dias)
- [ ] Tool grouping logic
- [ ] GroupedToolTimeline component
- [ ] ToolGroup component
- [ ] Refactor ExecutionTimeline
- [ ] Testes de integração

### Sprint 4 (2 dias)
- [ ] Ícones por tipo de tool
- [ ] Animações de entrada/saída
- [ ] Polish visual
- [ ] Testes E2E

---

## 📝 Notas de Design

### Cores e Ícones por Categoria

```typescript
const TOOL_STYLES = {
  // Read operations (blue)
  read: {
    icon: '📄',
    color: 'var(--vscode-terminal-ansiBlue)',
  },
  // Search operations (purple)
  search: {
    icon: '🔍',
    color: 'var(--vscode-terminal-ansiMagenta)',
  },
  // Write operations (orange/yellow)
  write: {
    icon: '✏️',
    color: 'var(--vscode-terminal-ansiYellow)',
  },
  // Execute operations (green)
  execute: {
    icon: '⚙️',
    color: 'var(--vscode-terminal-ansiGreen)',
  },
} as const;
```

### Animações

```css
/* Spinner animation */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Fade in from top */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## ✅ Checklist de Aceitação

Considerar feature completa quando:

- [ ] Timer em tempo real aparece durante execução
- [ ] Badge de ação atual atualiza a cada tool
- [ ] Múltiplas leituras agrupadas em "Explored X files"
- [ ] Cada tipo de tool tem ícone específico
- [ ] Animações suaves de entrada/saída
- [ ] Performance: não causa lag durante execução
- [ ] Testes cobrindo 80%+ dos casos
- [ ] UX similar ao Claude Code oficial

---

## 🔗 Referências

- Claude Code UI: `/home/ubuntu/projects/a208269-br-fintech_bank-korix-code-plugin/docs/korix-ui-feedback-analysis.md` (este doc)
- Componentes atuais:
  - `src/webview/components/chat/ExecutionTimeline.tsx`
  - `src/webview/components/chat/ToolExecutionItem.tsx`
  - `src/webview/store/index.ts`
- Runtime events:
  - `src/core/runtime/runtimeEvents.ts`
  - `src/core/runtime/executionEngine.ts`
