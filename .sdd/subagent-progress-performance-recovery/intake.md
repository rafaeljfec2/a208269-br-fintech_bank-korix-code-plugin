# Intake: Subagent Progress, Pooling, and Recovery

## Objetivo

Fechar a próxima fase do roadmap de tools/subagents com três melhorias incrementais: progress events, pooling leve de registries por tipo de subagent, e recovery básico para falhas transitórias.

## Acceptance Criteria

- AC-1: `SubagentRunner` encaminha eventos relevantes do child loop para um callback opcional do parent.
- AC-2: Eventos de progresso incluem tipo do subagent, evento runtime original e timestamp.
- AC-3: `SubagentRunner` reutiliza registry por tipo de subagent com limite LRU pequeno.
- AC-4: Runs normais preservam isolamento de tool set por tipo.
- AC-5: Falhas transitórias de subagent recebem retry controlado.
- AC-6: Falhas persistentes retornam metadata com número de recovery attempts.

## Fora do Escopo

- Streaming direto para webview.
- Serialization/deserialization de `RuntimeState`.
- Pool de `AgentLoop` ou `CancellationManager`.
- Retry de comandos destrutivos ou retry infinito.
