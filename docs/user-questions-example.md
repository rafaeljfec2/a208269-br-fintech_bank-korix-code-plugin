# Sistema de Perguntas Interativas - Exemplos de Uso

Este documento demonstra como usar o novo sistema de perguntas interativas no Korix Code.

## Visão Geral

O sistema permite que o assistente faça perguntas estruturadas ao usuário durante a execução, com opções de múltipla escolha (radio buttons ou checkboxes), timeout automático e opção "Other" sempre disponível.

## Uso Básico

### Seleção Única (Radio Buttons)

```typescript
import { askSingleChoice } from './core/runtime/userQuestion';
import type { RuntimeEventEmitter } from './core/runtime/runtimeEvents';

async function example(emitter: RuntimeEventEmitter) {
  const answer = await askSingleChoice(
    emitter,
    "Estratégia v3",
    "Como você quer que eu crie a v3?",
    [
      {
        value: "new_branch",
        label: "Criar branch v3 e modificar o mesmo arquivo lá",
        description: "Criar nova branch 'v3' a partir de 'v2' e fazer modificações no arquivo reusable_workflow_archimate_codegen.yml nessa branch",
      },
      {
        value: "new_file_v2",
        label: "Criar novo arquivo com nome diferente na branch v2",
        description: "Manter branch v2 e criar arquivo novo como reusable_workflow_archimate_codegen_v3.yml",
      },
      {
        value: "modify_existing",
        label: "Modificar o arquivo existente na branch v2 atual",
        description: "Fazer as modificações diretamente no arquivo reusable_workflow_archimate_codegen.yml da branch v2 (o que eu estava fazendo antes)",
      },
    ],
    30000, // timeout de 30 segundos
  );

  console.log("Usuário escolheu:", answer);
  // "new_branch" | "new_file_v2" | "modify_existing" | "texto personalizado"
}
```

### Múltipla Escolha (Checkboxes)

```typescript
import { askMultipleChoice } from './core/runtime/userQuestion';

async function exampleMultiple(emitter: RuntimeEventEmitter) {
  const answers = await askMultipleChoice(
    emitter,
    "Testes a executar",
    "Selecione quais testes rodar:",
    [
      {
        value: "unit",
        label: "Testes unitários",
        description: "Testa funções isoladas (vitest)",
      },
      {
        value: "integration",
        label: "Testes de integração",
        description: "Testa fluxos completos",
      },
      {
        value: "e2e",
        label: "Testes E2E",
        description: "Testa interface no browser",
      },
    ],
    60000, // timeout de 60 segundos
  );

  console.log("Usuário escolheu:", answers);
  // ["unit", "integration"] ou ["e2e", "Custom test suite"] etc
}
```

### Uso Avançado (API Completa)

```typescript
import { askUserQuestion } from './core/runtime/userQuestion';

async function exampleAdvanced(emitter: RuntimeEventEmitter) {
  const answers = await askUserQuestion(emitter, {
    title: "Continuar com warning?",
    question: "Encontrei 3 warnings no código. Como proceder?",
    mode: "single", // ou "multiple"
    options: [
      {
        value: "fix",
        label: "Corrigir warnings",
        description: "Parar e corrigir todos os warnings antes de continuar",
      },
      {
        value: "continue",
        label: "Continuar mesmo assim",
        description: "Ignorar warnings e prosseguir com a tarefa",
      },
    ],
    timeoutMs: 15000, // 15 segundos
    defaultAnswer: "fix", // resposta padrão se timeout
  });

  if (answers[0] === "fix") {
    // Corrigir warnings
  } else {
    // Continuar
  }
}
```

## Características

### ✅ Suportado

- **Seleção única** (radio buttons) - escolher UMA opção
- **Múltipla escolha** (checkboxes) - escolher VÁRIAS opções
- **Timeout configurável** com resposta padrão automática
- **Opção "Other"** sempre disponível com textarea
- **Timer visual** mostra contagem regressiva
- **Cancelamento** via tecla Esc
- **Validação** - não permite submit se nenhuma opção selecionada
- **Validação** - "Other" deve ter texto se selecionado

### 🎨 UI/UX

- Componente integrado ao chat (aparece como mensagem do sistema)
- Animações suaves (framer-motion)
- Tema VSCode nativo (cores e variáveis CSS)
- Keyboard navigation (Tab, Enter, Esc)
- Screen reader friendly (aria-live para timer)

### 🔧 Técnico

- **Event-driven**: baseado em `RuntimeEventEmitter`
- **Type-safe**: tipos rigorosos em toda a pipeline
- **Bi-directional**: comunicação Extension ↔ Webview
- **Promise-based**: `async/await` limpo
- **Testável**: componentes isolados e mockáveis

## Fluxo de Eventos

```
[Extension]
  askUserQuestion()
    ↓
  emitEvent(UserQuestionEvent)
    ↓
  [Webview]
    useRuntimeEvents recebe evento
      ↓
    Adiciona mensagem com QuestionCard
      ↓
    Usuário seleciona e clica Submit
      ↓
    sendMessage(answer_question)
      ↓
  [Extension]
    handleAnswerQuestion()
      ↓
    emitEvent(UserAnswerEvent)
      ↓
    Promise resolve com answers
      ↓
    Código continua execução
```

## Timeout Automático

Se o usuário não responder dentro do `timeoutMs`, o sistema:

1. **Auto-seleciona** a resposta padrão (`defaultAnswer`)
2. **Emite evento** `UserAnswerEvent` com `isTimeout: true`
3. **Remove a questão** da interface
4. **Adiciona mensagem** "⏱ Timeout - Resposta padrão: [answer]"
5. **Resolve a Promise** com a resposta padrão

Exemplo:

```typescript
const answer = await askSingleChoice(
  emitter,
  "Continuar?",
  "Testes passaram mas com warnings. Prosseguir?",
  [
    { value: "yes", label: "Sim", description: "Continuar normalmente" },
    { value: "no", label: "Não", description: "Parar e revisar" },
  ],
  10000, // 10 segundos - auto-seleciona "yes" se não responder
);

// Se timeout, answer === "yes" (primeira opção)
```

## Opção "Other"

A opção "Other" **sempre** aparece no final da lista. Quando selecionada, um textarea é exibido para entrada de texto livre.

**Validação**: Se "Other" está selecionado mas o textarea está vazio, o botão "Submit answers" fica desabilitado.

**Resultado**: Se "Other" foi selecionado com texto "Custom option", o array de respostas inclui o texto digitado:

```typescript
// Usuário selecionou "unit" e "Other: Run specific file"
answers === ["unit", "Run specific file"]
```

## Casos de Uso

### 1. Decisões de Arquitetura

```typescript
const approach = await askSingleChoice(
  emitter,
  "Arquitetura",
  "Como implementar autenticação?",
  [
    { value: "jwt", label: "JWT", description: "Stateless, escalável" },
    { value: "session", label: "Session", description: "Stateful, mais seguro" },
    { value: "oauth", label: "OAuth", description: "Delegação a terceiros" },
  ],
);
```

### 2. Seleção de Ferramentas

```typescript
const tools = await askMultipleChoice(
  emitter,
  "Testes",
  "Quais testes executar?",
  [
    { value: "unit", label: "Unit", description: "Testes unitários" },
    { value: "int", label: "Integration", description: "Testes de integração" },
    { value: "e2e", label: "E2E", description: "Testes end-to-end" },
  ],
);
// tools === ["unit", "int"]
```

### 3. Confirmações com Timeout

```typescript
const proceed = await askSingleChoice(
  emitter,
  "Deploy",
  "Continuar deploy para produção?",
  [
    { value: "no", label: "Não", description: "Cancelar deploy" },
    { value: "yes", label: "Sim", description: "Continuar deploy" },
  ],
  5000, // 5s para responder, default é "no" (seguro)
);
```

## Limitações

- **Timeout mínimo**: 5 segundos (evitar pressão no usuário)
- **Timeout máximo**: 5 minutos (evitar bloqueio indefinido)
- **Opções**: 2-4 opções por questão (+ "Other")
- **Questões aninhadas**: não suportado na v1
- **Validação customizada**: não suportado na v1

## Próximos Passos

- [ ] Adicionar testes unitários para `userQuestion.ts`
- [ ] Adicionar testes de componente para `QuestionCard.tsx`
- [ ] Documentar no guia de desenvolvimento
- [ ] Criar exemplo de uso em skill/plugin
