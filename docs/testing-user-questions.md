# Como Testar o Sistema de Perguntas Interativas

Este guia mostra como testar a funcionalidade de perguntas interativas (UserQuestion) implementada no Korix Code.

## 📋 Pré-requisitos

- Plugin compilado: `pnpm run compile`
- VSCode rodando com o plugin instalado

---

## 🧪 Método 1: Teste Manual via Exemplo de Código

### Passo 1: Criar arquivo de exemplo

Crie um arquivo de teste temporário em qualquer lugar do runtime que tenha acesso ao `RuntimeEventEmitter`:

```typescript
// exemplo-teste.ts (adicionar em src/ui/providers/ temporariamente)

import type { RuntimeEventEmitter } from '../../core/runtime/runtimeEvents';
import { askSingleChoice, askMultipleChoice } from '../../core/runtime/userQuestion';

export async function testarPerguntasInterativas(emitter: RuntimeEventEmitter) {
  console.log('🧪 Iniciando testes de perguntas interativas...\n');

  // TESTE 1: Seleção única (radio buttons)
  console.log('📝 TESTE 1: Seleção única');
  const estrategia = await askSingleChoice(
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
        description: "Fazer as modificações diretamente no arquivo reusable_workflow_archimate_codegen.yml da branch v2",
      },
    ],
    30000, // timeout 30s
  );

  console.log('✅ Resposta recebida:', estrategia);
  console.log('');

  // TESTE 2: Múltipla escolha (checkboxes)
  console.log('📝 TESTE 2: Múltipla escolha');
  const testes = await askMultipleChoice(
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
    60000, // timeout 60s
  );

  console.log('✅ Testes selecionados:', testes);
  console.log('');

  // TESTE 3: Timeout automático
  console.log('📝 TESTE 3: Timeout (aguarde 15s ou responda antes)');
  const continuar = await askSingleChoice(
    emitter,
    "Continuar?",
    "Encontrei 3 warnings no código. Como proceder?",
    [
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
    15000, // timeout 15s - auto-seleciona "fix" se não responder
  );

  console.log('✅ Decisão:', continuar);
  console.log('');

  console.log('🎉 Todos os testes concluídos!');
}
```

### Passo 2: Chamar o teste

Adicione a chamada em algum lugar acessível, por exemplo no `AgentExecutor`:

```typescript
// src/ui/providers/agentExecutor.ts

import { testarPerguntasInterativas } from './exemplo-teste';

// Dentro de algum método existente, adicione temporariamente:
if (content === '/test-questions') {
  await testarPerguntasInterativas(this.agentLoopFactory.getEventEmitter());
  return;
}
```

### Passo 3: Executar

1. Compile o plugin: `pnpm run compile`
2. Recarregue o VSCode
3. Abra o painel do Korix Code
4. Digite no chat: `/test-questions`
5. Observe as perguntas aparecerem no chat!

---

## 🎯 Método 2: Teste Integrado em Skill

### Criar skill de teste

Crie um arquivo de teste em `axiom-plugin/skills/`:

```markdown
---
name: test-questions
description: Testa o sistema de perguntas interativas
---

# Test Questions Skill

Esta skill demonstra o uso do sistema de perguntas interativas.

## Prompt

Você é um testador do sistema de perguntas interativas.

Execute os seguintes testes em sequência:

1. **Teste de Seleção Única**
   - Use `askSingleChoice` com 3 opções sobre estratégia de desenvolvimento
   - Timeout de 30 segundos
   - Mostre a resposta ao usuário

2. **Teste de Múltipla Escolha**
   - Use `askMultipleChoice` com opções de testes a executar
   - Timeout de 60 segundos
   - Mostre as respostas selecionadas

3. **Teste de Timeout**
   - Use `askSingleChoice` com timeout curto (15s)
   - Se o usuário não responder, use a resposta padrão

4. **Teste com Other**
   - Instrua o usuário a selecionar "Other" e digitar texto customizado
   - Verifique que o texto foi capturado

Após cada teste, informe o resultado ao usuário.

## Tools

Use as seguintes funções TypeScript (disponíveis no runtime):

```typescript
import { askSingleChoice, askMultipleChoice } from './core/runtime/userQuestion';
```

Execute os testes de forma interativa e reporte os resultados.
```

### Executar skill

```bash
# No chat do Korix Code
/test-questions
```

---

## 🔍 Método 3: Teste Unitário (Já Implementado)

Os testes unitários já estão prontos e podem ser executados:

```bash
# Testar apenas userQuestion
pnpm run test src/core/runtime/userQuestion.test.ts

# Testar tudo
pnpm run test
```

**Status**: ✅ 22 testes passando

---

## ✅ Checklist de Testes Manuais

### Interface (QuestionCard)

- [ ] **Renderização**
  - [ ] Título aparece corretamente
  - [ ] Pergunta aparece abaixo do título
  - [ ] Todas as opções são renderizadas
  - [ ] Opção "Other" sempre aparece no final

- [ ] **Seleção Única (Radio)**
  - [ ] Apenas uma opção pode ser selecionada por vez
  - [ ] Clicar em outra opção desmarca a anterior
  - [ ] Radio button tem visual correto

- [ ] **Múltipla Escolha (Checkbox)**
  - [ ] Múltiplas opções podem ser selecionadas
  - [ ] Clicar novamente desmarca a opção
  - [ ] Checkboxes têm visual correto

- [ ] **Opção "Other"**
  - [ ] Textarea aparece quando "Other" é selecionado
  - [ ] Textarea desaparece quando "Other" é desmarcado
  - [ ] Botão Submit desabilitado se "Other" selecionado mas vazio
  - [ ] Botão Submit desabilitado se texto < 3 caracteres
  - [ ] Auto-focus no textarea quando selecionado

- [ ] **Timer**
  - [ ] Timer visual aparece quando timeout definido
  - [ ] Countdown funciona (segundos diminuindo)
  - [ ] Timeout dispara resposta padrão automaticamente
  - [ ] Mensagem "⏱ Timeout" aparece quando timeout

- [ ] **Validação**
  - [ ] Botão Submit desabilitado quando nenhuma opção selecionada
  - [ ] Botão Submit habilitado quando opção válida selecionada
  - [ ] Mensagem de confirmação aparece após submit

- [ ] **Keyboard**
  - [ ] Tab navega entre opções
  - [ ] Espaço/Enter seleciona opção focada
  - [ ] Esc cancela (se implementado)

- [ ] **Visual**
  - [ ] Tema VSCode aplicado corretamente
  - [ ] Cores consistentes
  - [ ] Animação de entrada suave
  - [ ] Scroll funciona com muitas opções

### Backend (userQuestion)

- [ ] **Validações**
  - [ ] Erro se título vazio
  - [ ] Erro se pergunta vazia
  - [ ] Erro se < 2 opções
  - [ ] Erro se > 10 opções
  - [ ] Erro se timeout < 5s
  - [ ] Erro se timeout > 5min

- [ ] **Eventos**
  - [ ] `user_question` emitido corretamente
  - [ ] `user_answer` emitido ao responder
  - [ ] `isTimeout: true` quando timeout

- [ ] **Promise**
  - [ ] Resolve com resposta do usuário
  - [ ] Resolve com resposta padrão em timeout
  - [ ] Retorna array de strings

### Integração

- [ ] **Extension ↔ Webview**
  - [ ] Evento chega no webview
  - [ ] QuestionCard renderiza
  - [ ] Resposta volta para extension
  - [ ] Promise resolve na extension

- [ ] **Mensagens no Chat**
  - [ ] Questão aparece como mensagem do sistema
  - [ ] Resposta aparece como mensagem do usuário
  - [ ] Questão é removida após resposta
  - [ ] Activity log registra corretamente

---

## 🐛 Debug

### Logs Úteis

```typescript
// No backend (extension)
console.log('[UserQuestion] Emitting question:', questionId);
console.log('[UserQuestion] Received answer:', answers);

// No frontend (webview)
console.log('[QuestionCard] Rendering with mode:', mode);
console.log('[QuestionCard] User selected:', selected);
```

### DevTools do Webview

1. Abra VSCode DevTools: `Ctrl+Shift+P` → "Developer: Toggle Developer Tools"
2. Na aba Console, procure por `[QuestionCard]` ou `[RuntimeEvents]`
3. Inspecione o elemento do QuestionCard
4. Verifique o estado no React DevTools (se instalado)

### Verificar Store Zustand

No console do webview:

```javascript
// Ver estado do chat
window.__ZUSTAND_STORE__.getState().conversations

// Ver mensagens ativas
window.__ZUSTAND_STORE__.getState().activeChatId
```

---

## 📊 Casos de Teste Sugeridos

### Teste 1: Happy Path
```typescript
const answer = await askSingleChoice(
  emitter,
  "Deploy",
  "Continuar com deploy?",
  [
    { value: "yes", label: "Sim", description: "Fazer deploy" },
    { value: "no", label: "Não", description: "Cancelar" },
  ],
  30000,
);
// ✅ Usuário seleciona "yes" e clica Submit
// ✅ Promise resolve com "yes"
```

### Teste 2: Timeout
```typescript
const answer = await askSingleChoice(
  emitter,
  "Timeout Test",
  "Não responda esta pergunta",
  [
    { value: "a", label: "A", description: "Option A" },
    { value: "b", label: "B", description: "Option B" },
  ],
  10000,
);
// ✅ Aguarde 10 segundos
// ✅ Promise resolve com "a" (primeira opção)
// ✅ Mensagem "⏱ Timeout" aparece
```

### Teste 3: Other Option
```typescript
const answer = await askSingleChoice(
  emitter,
  "Custom Input",
  "Qual sua resposta?",
  [
    { value: "a", label: "Option A", description: "Pre-defined A" },
    { value: "b", label: "Option B", description: "Pre-defined B" },
  ],
  60000,
);
// ✅ Usuário seleciona "Other"
// ✅ Textarea aparece
// ✅ Usuário digita "Minha resposta customizada"
// ✅ Promise resolve com "Minha resposta customizada"
```

### Teste 4: Multiple Choice
```typescript
const answers = await askMultipleChoice(
  emitter,
  "Features",
  "Quais features implementar?",
  [
    { value: "auth", label: "Autenticação", description: "Login/logout" },
    { value: "api", label: "API REST", description: "Endpoints" },
    { value: "db", label: "Database", description: "PostgreSQL" },
  ],
  60000,
);
// ✅ Usuário seleciona "auth" e "db"
// ✅ Promise resolve com ["auth", "db"]
```

---

## 🎓 Exemplo Completo de Uso Real

Aqui está um exemplo de como usar em uma skill real:

```typescript
// Em uma skill de deploy
export async function deploySkill(emitter: RuntimeEventEmitter) {
  // 1. Perguntar ambiente
  const ambiente = await askSingleChoice(
    emitter,
    "Ambiente de Deploy",
    "Para qual ambiente você quer fazer deploy?",
    [
      { value: "dev", label: "Desenvolvimento", description: "Deploy para dev" },
      { value: "staging", label: "Staging", description: "Deploy para staging" },
      { value: "prod", label: "Produção", description: "Deploy para produção" },
    ],
    30000,
  );

  console.log(`Fazendo deploy para: ${ambiente}`);

  // 2. Perguntar quais serviços
  const servicos = await askMultipleChoice(
    emitter,
    "Serviços",
    "Quais serviços você quer deployar?",
    [
      { value: "api", label: "API Backend", description: "Serviço principal" },
      { value: "worker", label: "Worker", description: "Processamento async" },
      { value: "frontend", label: "Frontend", description: "Interface web" },
    ],
    60000,
  );

  console.log(`Deployando serviços: ${servicos.join(', ')}`);

  // 3. Confirmação com timeout curto
  const confirmar = await askSingleChoice(
    emitter,
    "Confirmação",
    "Confirmar deploy?",
    [
      { value: "no", label: "Não", description: "Cancelar" },
      { value: "yes", label: "Sim", description: "Continuar" },
    ],
    10000, // Auto-cancela em 10s por segurança
  );

  if (confirmar === "yes") {
    console.log("Deploy iniciado!");
    // ... lógica de deploy
  } else {
    console.log("Deploy cancelado.");
  }
}
```

---

## 📝 Troubleshooting

### Problema: Questão não aparece no chat

**Possíveis causas**:
- Evento não está sendo emitido
- `useRuntimeEvents` não está capturando o evento
- Chat não tem ID ativo

**Debug**:
```typescript
// Verificar se evento foi emitido
console.log('[DEBUG] user_question emitted:', questionId);

// Verificar se chegou no webview
console.log('[DEBUG] runtime_event received:', event.type);

// Verificar chatId
console.log('[DEBUG] activeChatId:', useStore.getState().activeChatId);
```

### Problema: Questão não é removida após resposta

**Causa**: Bug do messageId (JÁ CORRIGIDO)

**Verificar**: `addMessage` deve retornar o ID

### Problema: Timer não funciona

**Possíveis causas**:
- `timeoutMs` não foi passado
- `onTimeout` não definido
- Memory leak (JÁ CORRIGIDO com useRef)

**Debug**:
```typescript
console.log('[Timer] timeoutMs:', timeoutMs);
console.log('[Timer] remainingSeconds:', remainingSeconds);
```

---

## ✅ Conclusão

Agora você pode testar completamente o sistema de perguntas interativas!

**Próximos passos**:
1. Execute os testes unitários: `pnpm run test src/core/runtime/userQuestion.test.ts`
2. Crie um exemplo manual seguindo o Método 1
3. Valide a interface manualmente com o Checklist
4. Use em uma skill real!

Boa sorte! 🚀
