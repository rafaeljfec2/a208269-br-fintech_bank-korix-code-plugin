# Specification Review Report

**Spec:** Fix AskUserQuestion Over-Triggering  
**Reviewer:** Senior Technical Reviewer  
**Date:** 2026-05-19

## Completeness ✅

**Acceptance Criteria:**
- ✅ AC-1: Testável — 4 exemplos concretos de mensagens triviais
- ✅ AC-2: Testável — 3 exemplos de perguntas técnicas com resposta definida
- ✅ AC-3: Testável — 3 exemplos de casos legítimos que devem usar o tool
- ✅ AC-4: Testável — critério de diferenciação claro (factual vs decision)

**Implementation Plan:**
- ✅ Detalhado com before/after para cada mudança
- ✅ Line numbers especificados (~255, ~260, ~280)
- ✅ Decision tree adicionado para guiar o modelo
- ✅ Rule of thumb claro ("2-3 sentences → don't use")

**Testing Strategy:**
- ✅ Manual testing apropriado para behavioral fix
- ✅ Casos cobrem positivos e negativos
- ✅ Console logs como verificação adicional

## Feasibility ✅

**Technical Implementation:**
- ✅ **Zero código TypeScript** — apenas documentation
- ✅ Mudança em 1 arquivo: CLAUDE.md (~40 linhas)
- ✅ Sem impacto em APIs, UI, ou data model
- ✅ Sem dependências externas

**Risk Assessment:**
- ⚠️ Risco identificado: balanceamento instrucional
  - Muito restritivo → perder casos legítimos
  - Muito permissivo → problema persiste
- ✅ Mitigação: testes manuais iterativos + feedback do usuário

**Feasibility:** Alta — documentação é facilmente ajustável se necessário.

## Consistency ✅

**Alignment com projeto:**
- ✅ Segue princípio "avoid over-engineering" (CLAUDE.md global)
- ✅ Não adiciona abstrações desnecessárias
- ✅ Foca no problema exato (behavioral fix)
- ✅ Testing strategy apropriada ao contexto

**Alignment com codebase:**
- ✅ Preserva funcionalidade do tool (sem breaking changes)
- ✅ Mantém casos legítimos funcionando
- ✅ Não contradiz outras instruções do CLAUDE.md

## Blast Radius 🎯

**Arquivos afetados:**
1. **CLAUDE.md** (linhas 252-290, ~40 linhas modificadas)
   - Seção "Interactive Questions (AskUserQuestion)"
   - Reformular CRITICAL RULE
   - Rebalancear trigger phrases
   - Expandir "DO NOT use when"
   - Adicionar Decision Tree

**Arquivos NÃO afetados:**
- ❌ src/tools/askUserQuestion.ts
- ❌ src/core/runtime/executionEngine.ts
- ❌ src/core/runtime/userQuestion.ts
- ❌ src/webview/components/chat/QuestionCard.tsx
- ❌ Qualquer arquivo TypeScript

**Blast radius:** MÍNIMO — 1 arquivo documentation, ~40 linhas.

## Edge Cases & Considerations

**1. Borderline cases:**
- "qual a melhor prática para X?" — pode ser factual ou decision
  - Spec cobre: se UMA resposta → texto direto
  - Se múltiplas válidas → AskUserQuestion

**2. Multilingual:**
- Spec tem exemplos em PT-BR e EN
- Decision tree em EN (language-agnostic)

**3. Model interpretation:**
- Risco: modelo pode ainda interpretar incorretamente
- Mitigação: Decision tree + "Rule of thumb" reduzem ambiguidade

**4. Future evolution:**
- Se problema persistir → pode precisar ajustar tool description (askUserQuestion.ts)
- Mas começar com documentation é correto (menos invasivo)

## Recommendations

1. ✅ **Aprovar spec** — bem definida, feasível, baixo risco
2. ✅ **Implementar conforme planejado** — CLAUDE.md only
3. ⚠️ **Testar iterativamente:**
   - Começar com 5-10 mensagens triviais
   - Validar casos legítimos ainda funcionam
   - Ajustar se necessário
4. 📝 **Documentar outcome:**
   - Se fix funcionar → documentar pattern em compound doc
   - Se não funcionar → next step seria tool description

## Verdict

**✅ APPROVED**

- Spec completa e testável
- Implementação feasível e de baixo risco
- Consistente com padrões do projeto
- Blast radius mínimo
- Estratégia de testing apropriada

**Recomendação:** Prosseguir para implementação.

---

**Next Phase:** Task Decomposition → Implementation → Manual Testing
