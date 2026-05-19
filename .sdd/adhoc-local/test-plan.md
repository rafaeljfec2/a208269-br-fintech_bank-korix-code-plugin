# Manual Test Plan — AskUserQuestion Fix

## Test Objective

Verificar que o fix em CLAUDE.md elimina over-triggering do AskUserQuestion em mensagens triviais, mantendo funcionalidade para casos legítimos.

## Preconditions

1. ✅ CLAUDE.md modificado conforme spec
2. ✅ Working tree clean (mudanças commitadas)
3. VSCode extension recarregada (para pegar novo CLAUDE.md no system prompt)

## Test Cases

### ✅ AC-1: Mensagens triviais retornam texto simples

| Test Case | Input | Expected Output | Pass/Fail |
|-----------|-------|-----------------|-----------|
| TC-1.1 | "olá quem é vc?" | Texto direto (apresentação) | ⬜ |
| TC-1.2 | "como você funciona?" | Explicação direta das capabilities | ⬜ |
| TC-1.3 | "o que você pode fazer?" | Lista de features direto | ⬜ |
| TC-1.4 | "qual é seu nome?" | Resposta direta "Korix Code" | ⬜ |

**Verification:** Console logs NÃO devem mostrar `AskUserQuestion` sendo enviado ao provider.

---

### ✅ AC-2: Perguntas técnicas com resposta definida retornam texto simples

| Test Case | Input | Expected Output | Pass/Fail |
|-----------|-------|-----------------|-----------|
| TC-2.1 | "como eu faço um for loop em TypeScript?" | Código + explicação direto | ⬜ |
| TC-2.2 | "qual a sintaxe do git commit?" | Sintaxe direto (git commit -m "...") | ⬜ |
| TC-2.3 | "o que é SOLID?" | Explicação dos 5 princípios direto | ⬜ |
| TC-2.4 | "como funciona async/await?" | Explicação do mecanismo direto | ⬜ |

**Verification:** Console logs NÃO devem mostrar `AskUserQuestion`. Resposta deve ser texto direto com código/exemplos.

---

### ✅ AC-3: Casos legítimos AINDA disparam AskUserQuestion

| Test Case | Input | Expected Output | Pass/Fail |
|-----------|-------|-----------------|-----------|
| TC-3.1 | "qual banco de dados eu deveria usar para sistema com 1M users?" | AskUserQuestion com opções (PostgreSQL, MongoDB, Redis) | ⬜ |
| TC-3.2 | "me apresente as opções de autenticação" | AskUserQuestion com JWT, Session, OAuth2 | ⬜ |
| TC-3.3 | "escolha entre Docker e Kubernetes para deploy" | AskUserQuestion com comparação | ⬜ |
| TC-3.4 | "qual estratégia de cache usar?" | AskUserQuestion (múltiplas válidas) | ⬜ |

**Verification:** Console logs DEVEM mostrar `AskUserQuestion` sendo enviado. UI deve mostrar QuestionCard.

---

### ✅ AC-4: Modelo diferencia factual vs decision

| Test Case | Input | Expected Behavior | Pass/Fail |
|-----------|-------|-------------------|-----------|
| TC-4.1 | "qual a diferença entre JWT e session?" | Texto direto (explicação comparativa) | ⬜ |
| TC-4.2 | "qual usar: JWT ou session?" | AskUserQuestion (decisão) | ⬜ |
| TC-4.3 | "o que é Docker?" | Texto direto (factual) | ⬜ |
| TC-4.4 | "escolher entre Docker e bare metal" | AskUserQuestion (decisão) | ⬜ |

**Verification:** Modelo distingue perguntas-explicação (factual) de perguntas-escolha (decision).

---

## How to Test

### Setup

1. Commit mudanças no CLAUDE.md:
   ```bash
   git add CLAUDE.md
   git commit -m "fix: rebalance AskUserQuestion instructions to prevent over-triggering"
   ```

2. **Recarregar VSCode extension:**
   - Pressionar `F1` → "Developer: Reload Window"
   - OU fechar e reabrir VSCode
   - **IMPORTANTE:** Isso garante que o novo CLAUDE.md seja lido no system prompt

3. Abrir Developer Tools (Console):
   - `F1` → "Developer: Toggle Developer Tools"
   - Ir para aba "Console"
   - Filtrar por `AskUserQuestion` para ver logs

### Execution

Para cada test case:

1. **Enviar mensagem** no chat do Korix Code
2. **Observar console logs:**
   - Procurar por `[LiteLLM Provider] Sending request with tools`
   - Verificar se `AskUserQuestion` está no payload
   - Procurar por `[AskUserQuestionTool] execute() called`
3. **Verificar resposta:**
   - Se esperado texto direto → checar que resposta é texto simples
   - Se esperado AskUserQuestion → checar que QuestionCard aparece no UI
4. **Marcar resultado:** Pass (✅) ou Fail (❌) na tabela

### Example Log Patterns

**❌ FAIL (AskUserQuestion disparado indevidamente):**
```
[LiteLLM Provider] Sending request with tools: [..., "AskUserQuestion"]
[AskUserQuestionTool] execute() called with input: {...}
```

**✅ PASS (texto direto, sem AskUserQuestion):**
```
[LiteLLM Provider] Sending request with tools: ["ReadFile", "WriteFile", ...]
// AskUserQuestion NÃO aparece nos logs
```

**✅ PASS (AskUserQuestion disparado legitimamente):**
```
[LiteLLM Provider] Sending request with tools: [..., "AskUserQuestion"]
[AskUserQuestionTool] execute() called with input: {
  "questions": [{
    "question": "Qual banco de dados usar?",
    "options": [...]
  }]
}
```

---

## Success Criteria

**Minimum to pass:**
- ✅ Todos os TC de AC-1 passam (4/4)
- ✅ Todos os TC de AC-2 passam (4/4)
- ✅ Pelo menos 3/4 TC de AC-3 passam (casos legítimos preservados)
- ✅ Pelo menos 3/4 TC de AC-4 passam (diferenciação factual vs decision)

**Full pass:**
- ✅ 15/16 ou 16/16 test cases passam

**Fail criteria:**
- ❌ Qualquer TC de AC-1 ou AC-2 falha (over-triggering persiste)
- ❌ Menos de 3/4 TC de AC-3 passa (funcionalidade quebrada)

---

## Rollback Plan

Se testes falharem:

1. **Over-triggering persiste (AC-1/AC-2 falham):**
   - Revisar Decision Tree — pode precisar ser mais explícito
   - Adicionar mais exemplos negativos na seção "DO NOT use"
   - Considerar modificar tool description (askUserQuestion.ts)

2. **Funcionalidade quebrada (AC-3 falha):**
   - Instruções muito restritivas
   - Adicionar exemplos positivos mais claros
   - Revisar "USE AskUserQuestion when" — pode estar vago

3. **Pior caso:**
   - Reverter commit: `git revert HEAD`
   - Re-análise do problema (pode precisar fix no código, não apenas doc)

---

## Notes

- **Browser cache:** Se VSCode não recarregar CLAUDE.md, tente `Ctrl+Shift+P` → "Developer: Reload Window"
- **Model variance:** Claude pode ter alguma variação de resposta — rodar cada TC 2x se incerto
- **Console spam:** Se muito log, filtrar por "AskUserQuestion" na busca do Console
