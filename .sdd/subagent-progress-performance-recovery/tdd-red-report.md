# TDD Red Report: Subagent Progress, Pooling, and Recovery

## Red Evidence

Command:

```bash
pnpm exec vitest run src/core/subagent/subagentRunner.phase6.test.ts
```

Expected failures before implementation:

- Progress callback received no child runtime events.
- `createRegistry` was called twice for repeated runs of the same subagent type.
- Transient `ECONNRESET` failure was not retried.
- Persistent transient failure did not report `metadata.recoveryAttempts`.

## Acceptance Mapping

- AC-1 and AC-2: progress event forwarding test.
- AC-3 and AC-4: registry pooling test.
- AC-5: transient recovery success test.
- AC-6: persistent transient failure metadata test.
