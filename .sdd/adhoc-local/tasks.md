# Task Decomposition

## T-1: Reformular CRITICAL RULE (suavizar tom)
**AC:** AC-1, AC-2, AC-4  
**Files:** CLAUDE.md (linha ~255)  
**Outcome:** CRITICAL RULE passa de mandatório → contextual

**Before:**
```markdown
**CRITICAL RULE: When the user asks for recommendations or choices between multiple options, you MUST use AskUserQuestion tool. DO NOT answer with plain text explanations.**
```

**After:**
```markdown
**Use AskUserQuestion when the user needs to CHOOSE between multiple valid technical approaches where their preference matters.**

DO NOT use for questions with factual answers or when explaining concepts.
```

---

## T-2: Rebalancear trigger phrases (reduzir falsos positivos)
**AC:** AC-1, AC-2, AC-4  
**Files:** CLAUDE.md (linha ~260)  
**Outcome:** Triggers passam de amplos → específicos

**Before:**
```markdown
**PROACTIVE USE - YOU MUST use AskUserQuestion automatically when:**
- User asks "qual X?" / "which X?" / "what Y?" / "recommend Z"
- Multiple valid options exist (databases, libraries, frameworks, architectures)
- Technology or architecture decisions need user input
- User needs to choose between trade-offs
```

**After:**
```markdown
**USE AskUserQuestion when:**
- User explicitly asks to "choose between" or "compare" multiple options
- User asks "which X should I use for Y?" AND multiple valid answers exist
- Technical decision requires user preference (e.g., DB choice, framework choice)
```

---

## T-3: Expandir "DO NOT ask when" (adicionar exemplos explícitos)
**AC:** AC-1, AC-2  
**Files:** CLAUDE.md (linha ~280)  
**Outcome:** Seção negativa passa de vaga → explícita com 15+ exemplos

**Before:**
```markdown
**DO NOT ask when:**
- Only one correct technical solution exists
- Requirements are already clear and specific
- Trivial decisions (formatting, minor refactors)
- Information can be inferred from context
```

**After:**
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

---

## T-4: Adicionar Decision Tree (guia de decisão rápida)
**AC:** AC-4  
**Files:** CLAUDE.md (após "DO NOT ask when", linha ~320)  
**Outcome:** Nova seção com 4-step decision tree + rule of thumb

**New section:**
```markdown
### Decision Tree

Ask yourself:
1. Is there ONE objectively correct answer? → Answer directly
2. Am I explaining a concept? → Answer directly
3. Does the user need to make a CHOICE between valid options? → Use AskUserQuestion
4. Is this a trivial/social question? → Answer directly

**Rule of thumb:** If you can answer confidently in 2-3 sentences, DON'T use AskUserQuestion.
```

---

## Task Ordering (dependencies)

1. **T-1** → Reformular CRITICAL RULE (topo da seção)
2. **T-2** → Rebalancear trigger phrases (logo após CRITICAL RULE)
3. **T-3** → Expandir "DO NOT ask when" (meio da seção)
4. **T-4** → Adicionar Decision Tree (final da seção)

Todas as tarefas são sequenciais no mesmo arquivo, ordem top-down do documento.

---

## Verification

Após todas as tarefas:
- Ler CLAUDE.md linhas 250-330 para verificar consistência
- Confirmar que seção "Interactive Questions" está balanceada
- Verificar que exemplos cobrem PT-BR e EN
