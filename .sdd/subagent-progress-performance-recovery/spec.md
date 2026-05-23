# Spec: Subagent Progress, Pooling, and Recovery

## Design

### Progress Events

Adicionar `SubagentProgressEvent` e `onEvent?: (event) => void` em `SubagentRequest`.

O runner deve emitir eventos para:

- `iteration_start`
- `tool_call`
- `iteration_complete`

### Registry Pooling

Adicionar cache LRU interno no `SubagentRunner`, limitado a 5 registries. A chave inicial é o tipo de subagent. O cache reutiliza apenas registry, não runtime state nem cancellation managers.

### Recovery

Adicionar uma política mínima interna:

- `maxRetries`: 1
- retry apenas para erros transitórios por mensagem (`timeout`, `ECONNRESET`, `ETIMEDOUT`, `network`, `temporarily unavailable`, `rate limit`, `429`, `503`)
- não retry para cancelamento ou limite excedido
- registrar `recoveryAttempts` em `SubagentResult.metadata`

## Testes

- Red: progress callback recebe eventos relevantes do child loop.
- Red: registry é reutilizado para runs do mesmo tipo.
- Red: falha transitória é tentada novamente e retorna sucesso.
- Red: falha persistente registra attempts sem loop infinito.

## Riscos

- Registry pooling pode reter estado interno de caches das tools. Mitigação: pool só de registry por tipo, sem runtime state.
- Retry pode duplicar operações. Mitigação: retry somente no runner e apenas para erros transitórios antes de resultado final.
