# Intake: Subagent State & Resource Monitoring

## Objetivo

Implementar a Fase 7 do roadmap: serialization JSON-safe de `RuntimeState` e resource monitoring leve para subagents.

## Acceptance Criteria

- AC-1: `RuntimeState.serialize()` retorna um snapshot JSON-safe sem `Map`/`Set`.
- AC-2: `RuntimeState.deserialize(serialized)` restaura conversation, execution, workspace e memory.
- AC-3: Serialization preserva todos, tool calls, modified files e short-term memory simples.
- AC-4: `SubagentResult.metadata.resourceUsage` expõe duração e heap usado.
- AC-5: Resource monitoring não mata sessões/processos e não altera resource limits existentes.
- AC-6: Roadmap registra Fase 7 como concluída.

## Fora do Escopo

- Persistência em disco.
- Serialization de checkpoints/file contents.
- CPU hard limits.
- Kill automático por memória.
- Parent-to-child state snapshot wiring.
