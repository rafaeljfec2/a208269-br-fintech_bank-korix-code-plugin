# Subagents

Subagents are focused child agents launched through the `Task` tool. They reuse the main runtime loop, but run with an isolated tool registry and a type-specific system prompt.

The current implementation is intentionally small: it gives Korix focused delegation without adding async task storage, state sharing, pooling, or nested subagents yet.

## Architecture

```text
Parent Agent
  |
  | TaskTool.execute({ type, prompt, context? })
  v
ToolContext.runSubagent(SubagentRequest)
  |
  v
SubagentRunner
  |-- reads SUBAGENT_CONFIGS[type]
  |-- creates an isolated ToolRegistry
  |-- builds a type-specific system prompt
  |-- runs AgentLoop with an allowed-tools policy
  |-- returns SubagentResult
```

Key files:

- `src/tools/task.ts` exposes the `Task` tool schema and dispatches to `context.runSubagent`.
- `src/core/subagent/subagentTypes.ts` defines subagent types, configs, prompts, request/result contracts.
- `src/core/subagent/subagentRunner.ts` creates isolated registries, runs child loops, and tracks in-memory metrics.

## Execution Flow

1. The parent agent calls `Task` with a `type` and focused `prompt`.
2. `TaskTool` validates the input with Zod and requires agent mode.
3. `TaskTool` delegates to `context.runSubagent`.
4. `SubagentRunner` loads the config for the requested type.
5. It creates a child registry with only the allowed tools from that config.
6. It calls `AgentLoop.run()` with `mode: "agent"` and an explicit `toolUsePolicy.allowedTools`.
7. It extracts the final assistant message and tool history from the final runtime state.
8. It records aggregate metrics and returns `SubagentResult`.

## Subagent Types

| Type | Purpose | Allowed Tools | Max Iterations | Timeout |
| --- | --- | --- | ---: | ---: |
| `explore` | Find relevant files, symbols, references, diagnostics, and workspace evidence. | `ReadFile`, `ListDirectory`, `SearchFiles`, `Grep`, `FindReferences`, `FindSymbols`, `GitStatus`, `GitDiff`, `ChangedFiles`, `Problems`, `GetDiagnostics`, `WorkspaceGraph`, `GetOpenFiles`, `GetCurrentFile` | 10 | 60s |
| `plan` | Produce an implementation plan with SDD/TDD traceability. | `ReadFile`, `ListDirectory`, `Grep`, `FindReferences`, `FindSymbols`, `WorkspaceGraph`, `GetOpenFiles`, `GetCurrentFile`, `GitStatus`, `GitDiff`, `ChangedFiles`, `Problems`, `GetDiagnostics`, `Glob` | 12 | 120s |
| `review` | Review code for correctness, security, quality, maintainability, and test gaps. | `ReadFile`, `ListDirectory`, `Grep`, `FindReferences`, `FindSymbols`, `GitStatus`, `GitDiff`, `ChangedFiles`, `Problems`, `GetDiagnostics`, `WorkspaceGraph`, `Glob` | 12 | 120s |
| `shell` | Run approval-aware terminal commands and report stdout/stderr/exit details. | `RunCommand`, `Await` | 5 | 300s |
| `test` | Run focused test commands and summarize pass/fail details. | `RunCommand`, `Await`, `ReadFile` | 8 | 600s |

All current subagents are isolated.

## Tool Isolation

Subagents do not inherit the full parent registry. `SubagentRunner.createSubagentRegistry()` creates a fresh `ToolRegistry` and registers only tools listed in `SUBAGENT_CONFIGS[type].allowedTools`.

This prevents accidental capability drift:

- Read-only subagents do not receive write/edit/delete tools.
- `shell` receives only terminal execution tools.
- `test` receives terminal tools plus `ReadFile`.
- No subagent receives `Task`, so nested subagents are not available.
- No subagent receives `AskUserQuestion`, so child agents cannot directly interrupt the user.
- No subagent receives `WebFetch` in the current MVP.

Terminal safety remains centralized in `RunCommand`, `Await`, command validation, and the runtime permission flow.

## Prompt Contracts

Each subagent has a dedicated prompt from `buildSubagentPrompt(type)`.

- `explore` must return concise findings with paths, symbols, and evidence.
- `plan` must produce an SDD/TDD-oriented implementation plan.
- `review` must prioritize findings with severity, evidence, issue, impact, recommendation, and test gaps.
- `shell` must run only necessary commands and report command output, errors, exit code, timeouts, and failures.
- `test` must run focused test commands and report pass/fail state, failure details, and verification gaps.

The prompts explicitly prohibit file modification, deletion, todo updates, nested subagents, web fetches, and user questions unless the type-specific allowlist supports the relevant tool.

## Task Tool API

Input:

```ts
{
  readonly type: "explore" | "plan" | "review" | "shell" | "test";
  readonly prompt: string;
  readonly context?: Record<string, unknown>;
}
```

Output:

```ts
{
  readonly type: SubagentType;
  readonly success: boolean;
  readonly output: string;
  readonly iterations: number;
  readonly duration: number;
  readonly error?: string;
  readonly metadata: {
    readonly toolsCalled: readonly string[];
  };
}
```

`Task` is available only in agent mode and does not require approval by itself. Individual child tool calls still follow their own approval and permission behavior.

## Usage Examples

Explore:

```json
{
  "type": "explore",
  "prompt": "Find the files, symbols, and tests related to terminal background sessions."
}
```

Plan:

```json
{
  "type": "plan",
  "prompt": "Plan a TDD implementation for adding resource limits to subagents."
}
```

Review:

```json
{
  "type": "review",
  "prompt": "Review the current diff for correctness, security, project conventions, and missing tests."
}
```

Shell:

```json
{
  "type": "shell",
  "prompt": "Run git status and summarize the working tree state."
}
```

Test:

```json
{
  "type": "test",
  "prompt": "Run the focused subagent and task tool test suites and summarize failures."
}
```

## Metrics

`SubagentRunner.getMetrics()` returns an immutable snapshot of in-memory aggregate metrics for that runner instance:

```ts
{
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly totalDuration: number;
  readonly totalIterations: number;
  readonly runsByType: Readonly<Record<SubagentType, number>>;
  readonly toolUsage: Readonly<Record<string, number>>;
}
```

Notes:

- Metrics are local to the runner instance.
- Snapshots copy nested objects so callers cannot mutate internal state.
- Runtime-level aggregation is future work.

## Performance Guidelines

- Keep subagent prompts focused. A broad prompt often wastes iterations.
- Prefer `explore` or `plan` before `shell` when the task requires code understanding.
- Use `test` for focused test execution, not broad validation of the whole repo by default.
- Keep allowed tool sets narrow; add tools only when a type-specific use case needs them.
- Watch `totalIterations`, `totalDuration`, and `toolUsage` when tuning prompts.

## Troubleshooting

Subagent cannot call a tool:

- Check `SUBAGENT_CONFIGS[type].allowedTools`.
- Check whether the parent registry actually has that tool registered.
- Check the runtime `toolUsePolicy.allowedTools`.

Subagent returns no useful output:

- Confirm the provider returned a final assistant message.
- Tighten the task prompt.
- Use a more specific subagent type.

Terminal command is denied:

- Check `RunCommand` validation.
- Check the runtime permission manager and approval response.
- Avoid destructive commands unless the user explicitly requested them.

Metrics look empty:

- Metrics are per `SubagentRunner` instance.
- Confirm the same runner instance is used for multiple reads.

## How To Add A New Subagent Type

1. Add the new literal to `SubagentType` in `src/core/subagent/subagentTypes.ts`.
2. Add a matching entry to `SUBAGENT_CONFIGS`.
3. Keep the initial `allowedTools` list as small as possible.
4. Add a prompt branch in `buildSubagentPrompt(type)`.
5. Add the type to `TaskSchema` in `src/tools/task.ts`.
6. Add tests for:
   - schema acceptance.
   - registry allowlist.
   - denied risky tools.
   - prompt contract.
   - `TaskTool.execute()` forwarding.
7. Run focused tests, lint, full tests, `git diff --check`, and the VSCode architecture gate.

Do not add broad tools speculatively. Every tool in a subagent allowlist should have a concrete reason and a test that protects the capability boundary.

## Current Limitations

- No async/background `Task` mode.
- No task result store.
- No nested subagents.
- No subagent pooling.
- No state serialization from parent to child.
- No progress streaming from child to parent.
- No global metrics aggregation.
- No resource-limit enforcement beyond existing iteration/time configuration.
