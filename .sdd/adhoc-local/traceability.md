# AC Traceability Report

**Spec:** Fix AskUserQuestion Over-Triggering  
**Date:** 2026-05-19

## Traceability Matrix

### AC-1: Mensagens triviais NÃO disparam AskUserQuestion ✅

**Code Evidence:**
- [CLAUDE.md:138-142](CLAUDE.md#L138-L142) — Seção "❌ Trivial/social queries" com 4 exemplos explícitos:
  ```markdown
  ❌ Trivial/social queries:
    - "olá quem é vc?" → introduce yourself
    - "como você funciona?" → explain your capabilities
    - "o que você pode fazer?" → list your features
    - "qual é seu nome?" → answer directly
  ```
- [CLAUDE.md:168](CLAUDE.md#L168) — Decision Tree step 4: "Is this a trivial/social question? → Answer directly"

**Test Evidence:**
- `.sdd/adhoc-local/test-plan.md` TC-1.1 a TC-1.4 (manual testing)
- Verificação via console logs (AskUserQuestion NÃO deve aparecer)

**Status:** ✅ COVERED (pending manual verification)

---

### AC-2: Perguntas técnicas simples NÃO disparam AskUserQuestion ✅

**Code Evidence:**
- [CLAUDE.md:132-136](CLAUDE.md#L132-L136) — Seção "❌ Questions with factual answers" com 4 exemplos:
  ```markdown
  ❌ Questions with factual answers:
    - "o que é TypeScript?" → explain directly
    - "como funciona async/await?" → explain directly
    - "qual a sintaxe de X?" → show syntax directly
    - "o que faz essa função?" → analyze and explain
  ```
- [CLAUDE.md:144-148](CLAUDE.md#L144-L148) — Seção "❌ Questions where ONE correct answer exists" com 4 exemplos:
  ```markdown
  - "qual o tipo de retorno correto?" → analyze and answer
  - "esse código tem bug?" → diagnose and explain
  - "como eu faço um for loop em TypeScript?" → show code example
  - "qual a sintaxe do git commit?" → show syntax
  ```
- [CLAUDE.md:165](CLAUDE.md#L165) — Decision Tree step 1: "Is there ONE objectively correct answer? → Answer directly"

**Test Evidence:**
- `.sdd/adhoc-local/test-plan.md` TC-2.1 a TC-2.4 (manual testing)

**Status:** ✅ COVERED (pending manual verification)

---

### AC-3: Casos legítimos AINDA disparam AskUserQuestion ✅

**Code Evidence:**
- [CLAUDE.md:117-122](CLAUDE.md#L117-L122) — Seção "USE AskUserQuestion when" com 5 critérios específicos:
  ```markdown
  - User explicitly asks to "choose between" or "compare" multiple options
  - User asks "which X should I use for Y?" AND multiple valid answers exist
  - Technical decision requires user preference (e.g., DB choice, framework choice)
  - User says "me apresente as opções" / "show me options" / "present options"
  - User asks "de forma interativa" / "interactively"
  ```
- [CLAUDE.md:124-128](CLAUDE.md#L124-L128) — Exemplos positivos:
  ```markdown
  - "qual banco de dados você recomenda para sistema com 1M users?" → AskUserQuestion
  - "me apresente as opções de autenticação" → AskUserQuestion
  - "escolha entre Docker e Kubernetes para deploy" → AskUserQuestion
  - "qual estratégia de cache usar?" → AskUserQuestion
  ```
- [CLAUDE.md:156-159](CLAUDE.md#L156-L159) — Seção "✅ ONLY use when user must CHOOSE" reforça casos legítimos
- [CLAUDE.md:167](CLAUDE.md#L167) — Decision Tree step 3: "Does the user need to make a CHOICE between valid options? → Use AskUserQuestion"

**Test Evidence:**
- `.sdd/adhoc-local/test-plan.md` TC-3.1 a TC-3.4 (manual testing)
- Verificação via console logs (AskUserQuestion DEVE aparecer)

**Status:** ✅ COVERED (pending manual verification)

---

### AC-4: Modelo diferencia pergunta-com-resposta vs pergunta-requer-decisão ✅

**Code Evidence:**
- [CLAUDE.md:150-154](CLAUDE.md#L150-L154) — Seção "❌ User is asking for explanation, not decision" com 4 exemplos:
  ```markdown
  - "qual a diferença entre X e Y?" → explain differences
  - "por que usar X?" → explain rationale
  - "como X funciona?" → explain mechanism
  - "o que é SOLID?" → explain principles
  ```
- [CLAUDE.md:161-170](CLAUDE.md#L161-L170) — **Decision Tree completa** com 4 steps:
  ```markdown
  1. Is there ONE objectively correct answer? → Answer directly
  2. Am I explaining a concept? → Answer directly
  3. Does the user need to make a CHOICE between valid options? → Use AskUserQuestion
  4. Is this a trivial/social question? → Answer directly
  
  Rule of thumb: If you can answer confidently in 2-3 sentences, DON'T use AskUserQuestion.
  ```

**Test Evidence:**
- `.sdd/adhoc-local/test-plan.md` TC-4.1 a TC-4.4 (manual testing)
- Pares comparativos testam diferenciação:
  - "qual a diferença entre JWT e session?" (factual) vs "qual usar: JWT ou session?" (decision)
  - "o que é Docker?" (factual) vs "escolher entre Docker e bare metal" (decision)

**Status:** ✅ COVERED (pending manual verification)

---

## Summary

### What Changed

**Files Modified:**
1. [CLAUDE.md](CLAUDE.md) — Seção "Interactive Questions (AskUserQuestion)" (linhas 107-170)
   - Reformulada CRITICAL RULE (linha 109-113)
   - Rebalanceadas trigger phrases (linhas 117-128)
   - Expandida seção "DO NOT use" com 15+ exemplos (linhas 130-159)
   - Adicionada Decision Tree (linhas 161-170)

**Lines Changed:** ~60 linhas modificadas/adicionadas

**No Code Changes:** Zero arquivos TypeScript modificados — apenas documentation.

### Decisions Made

1. **Tone shift:** De imperativo ("MUST use") → orientativo ("Use when user needs to CHOOSE")
   - **Rationale:** Imperativo causava over-triggering; orientativo dá contexto ao modelo

2. **Explicit negatives:** Expandir "DO NOT use" com 15+ exemplos em 4 categorias
   - **Rationale:** Exemplos explícitos reduzem ambiguidade melhor que regras abstratas

3. **Decision Tree:** Adicionar flowchart de 4 steps + rule of thumb
   - **Rationale:** Guia rápido de decisão para o modelo avaliar contexto antes de usar o tool

4. **Preserve positives:** Manter seção "USE when" com exemplos legítimos
   - **Rationale:** Garantir que funcionalidade não seja quebrada

### Risks

**Low Risk:**
- Mudança isolada em documentation (CLAUDE.md)
- Reversível via `git revert` se necessário
- Não afeta código de produção

**Medium Risk:**
- Balanceamento instrucional: pode ser muito restritivo ou permissivo
- **Mitigação:** Test plan manual com 16 test cases cobrindo positivos e negativos

**Identified in testing:**
- Se AC-1/AC-2 falharem → instruções ainda muito permissivas (precisam ser mais explícitas)
- Se AC-3 falhar → instruções muito restritivas (adicionar mais exemplos positivos)

### Suggestions

**Follow-up improvements:**

1. **Telemetry:** Adicionar logging de AskUserQuestion usage
   - Track: quantas vezes disparado, em que contextos
   - Análise: identificar patterns de over/under-triggering
   - Melhoria contínua das instruções

2. **A/B Testing:** Versões alternativas do CLAUDE.md
   - Testar diferentes phrasings do Decision Tree
   - Medir qual reduz mais falsos positivos

3. **Tool Description:** Se problema persistir, considerar modificar `askUserQuestion.ts`
   - Atualmente: "Use this tool when: User asks for recommendations..."
   - Alternativa: Alinhar description com Decision Tree

4. **System Prompt Refactor:** Seção Interactive Questions está grande (~70 linhas)
   - Considerar extrair para arquivo separado
   - Incluir via reference no CLAUDE.md

5. **Documentation:** Criar compound engineering doc sobre este fix
   - Pattern: "Balancing LLM tool usage via documentation"
   - Future reference para problemas similares

---

## Verdict

✅ **ALL ACs COVERED**

Every acceptance criterion is traceable to:
- Specific lines in CLAUDE.md with explicit examples
- Manual test cases in test-plan.md
- Decision Tree providing algorithmic guidance

**Next Step:** Execute manual testing per test plan, report results.
