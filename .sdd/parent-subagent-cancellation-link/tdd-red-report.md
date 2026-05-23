# TDD Red Report: Parent-to-Subagent Cancellation Link

## Red Evidence

Command:

```bash
pnpm exec vitest run src/tools/task.test.ts src/core/subagent/subagentRunner.test.ts
```

Expected Red failures before implementation:

- `TaskTool` did not forward `ToolContext.signal` as `parentSignal`.
- `SubagentRunner` did not call child `AgentLoop.cancel("Parent execution cancelled")`.

## Acceptance Mapping

- AC-1 covered by `TaskTool should call the runtime subagent callback`.
- AC-2, AC-3 and AC-4 covered by `SubagentRunner should cancel the child agent loop when the parent signal aborts`.
