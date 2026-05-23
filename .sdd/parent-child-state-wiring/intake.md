# Intake: Parent-to-Child State Wiring

## Objetivo

Usar a serialization da Fase 7 para passar snapshot estruturado do runtime parent para subagents, sem permitir mutação do estado parent.

## Acceptance Criteria

- AC-1: `ToolContext` expõe `getRuntimeStateSnapshot`.
- AC-2: `TaskTool` repassa `parentStateSnapshot` ao subagent.
- AC-3: `ExecutionEngine` fornece `state.serialize()` no contexto de tools.
- AC-4: `SubagentRunner` preserva metadata indicando se recebeu snapshot parent.
- AC-5: Snapshot recebido pelo subagent é uma cópia serializada e não muta parent state.

## Fora do Escopo

- Restaurar o child `RuntimeState` automaticamente a partir do snapshot.
- Enviar snapshot inteiro para prompt do modelo.
- Persistência em disco.
- UI de replay/debug.
