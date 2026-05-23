# Spec: Parent-to-Subagent Cancellation Link

## Design

Adicionar um campo opcional em `SubagentRequest`:

```ts
readonly parentSignal?: AbortSignal;
```

O `TaskTool` deve encaminhar `context.signal` para `context.runSubagent`.

O `SubagentRunner` deve:

- aceitar `parentSignal` sem exigir mudanças em callers existentes;
- criar o `AgentLoop` filho como hoje, com `CancellationManager` próprio;
- registrar um listener no `parentSignal`;
- quando o parent abortar, chamar `agentLoop.cancel("Parent execution cancelled")`;
- remover o listener ao finalizar;
- retornar metadata com `stopReason: "cancelled"` quando o erro final indicar cancelamento.

## Testes

- `TaskTool` repassa `context.signal` para `runSubagent`.
- `SubagentRunner` cancela o child loop quando `parentSignal` aborta.
- `SubagentRunner` marca `metadata.stopReason` como `cancelled`.
- `SubagentRunner` preserva comportamento normal sem cancelamento.

## Riscos

- Cancelar o child loop não deve matar sessões de terminal por efeito colateral.
- O listener do parent signal precisa ser removido para evitar vazamento.
- O child continua isolado: não compartilhar `CancellationManager`, apenas encaminhar evento de abort.
