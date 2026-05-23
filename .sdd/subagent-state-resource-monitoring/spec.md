# Spec: Subagent State & Resource Monitoring

## RuntimeState Serialization

Adicionar tipos serializáveis em `runtimeTypes.ts`:

- `SerializedRuntimeStateSnapshot`
- `SerializedMemorySnapshot`
- `SerializedWorkspaceStateSnapshot`

Converter:

- `Map` -> array de entries.
- `Set` -> array.

Adicionar em `RuntimeState`:

- `serialize(): SerializedRuntimeStateSnapshot`
- `static deserialize(snapshot): RuntimeState`

## Subagent Resource Monitoring

Adicionar `resourceUsage` em `SubagentResult.metadata`:

```ts
{
  durationMs: number;
  heapUsedBytes: number;
}
```

Medir:

- `durationMs` usando `Date.now() - startTime`.
- `heapUsedBytes` usando `process.memoryUsage().heapUsed`.

Não aplicar kill automático.

## Testes

- Red: `RuntimeState.serialize()` é JSON-safe e preserva state.
- Red: `RuntimeState.deserialize()` restaura state serializado.
- Red: subagent metadata inclui `resourceUsage`.
