# Spec: Parent-to-Child State Wiring

## Design

Adicionar em `ToolContext`:

```ts
readonly getRuntimeStateSnapshot?: () => SerializedRuntimeStateSnapshot;
```

Adicionar em `SubagentRequest`:

```ts
readonly parentStateSnapshot?: SerializedRuntimeStateSnapshot;
```

`ExecutionEngine.buildToolContext(state)` deve expor um callback que chama `state.serialize()`.

`TaskTool.execute()` deve chamar esse callback, se disponível, e anexar o snapshot ao request enviado a `runSubagent`.

`SubagentRunner` não deve restaurar o child automaticamente nesta fase. Deve apenas preservar metadata:

```ts
metadata.parentStateSnapshotReceived: boolean
```

## Testes

- `TaskTool` repassa parent snapshot quando o contexto fornece callback.
- `ExecutionEngine` passa snapshot serializado para tools via `ToolContext`.
- `SubagentRunner` retorna metadata indicando snapshot recebido.
- Mutar o snapshot serializado não altera o parent state.
