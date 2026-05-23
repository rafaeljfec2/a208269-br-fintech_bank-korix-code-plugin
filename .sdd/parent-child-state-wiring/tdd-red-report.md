# TDD Red Report: Parent-to-Child State Wiring

## Red Evidence

Command:

```bash
pnpm exec vitest run src/tools/task.test.ts src/core/subagent/subagentRunner.phase6.test.ts src/core/runtime/executionEngine.parentState.test.ts
```

Expected Red failures before implementation:

- `TaskTool` did not forward `parentStateSnapshot`.
- `SubagentRunner` did not set `metadata.parentStateSnapshotReceived`.
- `ExecutionEngine` did not expose serialized runtime snapshot in `ToolContext`.

## Acceptance Mapping

- AC-1 and AC-3: `executionEngine.parentState.test.ts`.
- AC-2: `task.test.ts`.
- AC-4: `subagentRunner.phase6.test.ts`.
- AC-5: JSON-safe snapshot assertion in `executionEngine.parentState.test.ts`.
