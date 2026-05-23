# Intake: Parent-to-Subagent Cancellation Link

## Objetivo

Propagar o cancelamento do agente pai para subagents em execução, mantendo isolamento de runtime e evitando efeitos colaterais em sessões de terminal.

## Acceptance Criteria

- AC-1: `Task` repassa o `ToolContext.signal` para a requisição de subagent.
- AC-2: `SubagentRunner` cancela o `AgentLoop` filho quando o parent signal aborta.
- AC-3: Cancelamento vindo do parent retorna `SubagentResult` estruturado com `success: false`.
- AC-4: `SubagentResult.metadata.stopReason` registra `cancelled`.
- AC-5: Runs normais sem parent signal continuam inalterados.

## Fora do Escopo

- Auto-kill de sessões de terminal/background work.
- Compartilhar `CancellationManager` entre parent e child.
- Retry/recovery avançado de subagents cancelados.
- Mudanças de UI.
