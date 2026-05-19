# SPEC: Fix AskUserQuestion Over-Triggering

## Overview

O `AskUserQuestion` tool está sendo disparado em TODAS as mensagens do usuário, incluindo perguntas triviais como "olá quem é vc?". O problema é causado por instruções excessivamente agressivas no `CLAUDE.md` que fazem o modelo interpretar quase qualquer mensagem como um trigger para o tool.

## Root Cause

`CLAUDE.md:252-268` contém:
- **CRITICAL RULE** mandatório para uso do tool
- Trigger phrases muito amplos (`"qual X?"`, `"which X?"`, `"what Y?"`)
- Lista extensa de casos de uso obrigatório
- Seção "DO NOT ask when" muito pequena e vaga

Resultado: qualquer mensagem contendo palavras interrogativas dispara o tool indevidamente.

## Acceptance Criteria

**AC-1:** Mensagens triviais NÃO disparam AskUserQuestion
- "olá quem é vc?" → resposta texto simples
- "como você funciona?" → resposta texto simples
- "o que você pode fazer?" → resposta texto simples
- "qual é seu nome?" → resposta texto simples

**AC-2:** Perguntas técnicas simples NÃO disparam AskUserQuestion
- "como eu faço um for loop em TypeScript?" → resposta código + explicação
- "qual a sintaxe do git commit?" → resposta texto simples
- "o que é SOLID?" → resposta texto simples

**AC-3:** Casos legítimos AINDA disparam AskUserQuestion
- "qual banco de dados eu deveria usar para X?" → AskUserQuestion com opções
- "me apresente as opções de autenticação" → AskUserQuestion
- "escolha entre Docker e Kubernetes" → AskUserQuestion

**AC-4:** O modelo diferencia entre:
- Pergunta que TEM resposta definida (texto simples)
- Pergunta que REQUER decisão do usuário (AskUserQuestion)

## Data Model Changes

Nenhuma.

## API Contract Changes

Nenhuma.

## UI Changes

Nenhuma — apenas behavior fix.

## Implementation Plan

### Mudanças no CLAUDE.md

**1. Reformular CRITICAL RULE (linha ~255)**

❌ ANTES:
```markdown
**CRITICAL RULE: When the user asks for recommendations or choices between multiple options, you MUST use AskUserQuestion tool. DO NOT answer with plain text explanations.**
```

✅ DEPOIS:
```markdown
**Use AskUserQuestion when the user needs to CHOOSE between multiple valid technical approaches where their preference matters.**

DO NOT use for questions with factual answers or when explaining concepts.
```

**2. Rebalancear trigger phrases (linha ~260)**

❌ ANTES (muito amplo):
```markdown
**PROACTIVE USE - YOU MUST use AskUserQuestion automatically when:**
- User asks "qual X?" / "which X?" / "what Y?" / "recommend Z"
```

✅ DEPOIS (mais específico):
```markdown
**USE AskUserQuestion when:**
- User explicitly asks to "choose between" or "compare" multiple options
- User asks "which X should I use for Y?" AND multiple valid answers exist
- Technical decision requires user preference (e.g., DB choice, framework choice)
```

**3. Expandir seção "DO NOT ask when" (linha ~280)**

❌ ANTES (vago):
```markdown
**DO NOT ask when:**
- Only one correct technical solution exists
- Requirements are already clear and specific
- Trivial decisions (formatting, minor refactors)
- Information can be inferred from context
```

✅ DEPOIS (explícito com exemplos):
```markdown
**DO NOT use AskUserQuestion when:**

❌ Questions with factual answers:
  - "o que é TypeScript?" → explain directly
  - "como funciona async/await?" → explain directly
  - "qual a sintaxe de X?" → show syntax directly

❌ Trivial/social queries:
  - "olá quem é vc?" → introduce yourself
  - "como você funciona?" → explain your capabilities
  - "o que você pode fazer?" → list your features

❌ Questions where ONE correct answer exists:
  - "qual o tipo de retorno correto?" → analyze and answer
  - "esse código tem bug?" → diagnose and explain

❌ User is asking for explanation, not decision:
  - "qual a diferença entre X e Y?" → explain differences
  - "por que usar X?" → explain rationale

✅ ONLY use when user must CHOOSE between multiple valid options:
  - "qual banco usar: Postgres ou Mongo?" → present tradeoffs
  - "me apresente as opções de deploy" → show options
  - "escolha entre JWT e session" → present comparison
```

**4. Adicionar seção "When In Doubt"**

```markdown
### Decision Tree

Ask yourself:
1. Is there ONE objectively correct answer? → Answer directly
2. Am I explaining a concept? → Answer directly
3. Does the user need to make a CHOICE between valid options? → Use AskUserQuestion
4. Is this a trivial/social question? → Answer directly

**Rule of thumb:** If you can answer confidently in 2-3 sentences, DON'T use AskUserQuestion.
```

## Out of Scope

- Mudanças na implementação do tool (apenas documentation fix)
- Mudanças no UI do QuestionCard
- Mudanças no runtime/executionEngine

## Testing Strategy

1. **Manual testing** com mensagens triviais
2. **Manual testing** com perguntas técnicas legítimas
3. **Manual testing** com casos que DEVEM usar AskUserQuestion
4. Verificar logs do console — `AskUserQuestion` só deve aparecer em casos legítimos

## Risks

- Instrucional balancing: muito restritivo → perder casos legítimos
- Muito permissivo → mesmo problema continua

Mitigação: testes manuais iterativos com feedback do usuário.
