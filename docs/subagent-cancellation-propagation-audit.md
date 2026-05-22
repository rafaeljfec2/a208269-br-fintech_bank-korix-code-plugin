# Subagent Cancellation Propagation Audit

**Date**: 2026-05-22

**Scope**: Tools Roadmap Fase 5.2

**Status**: Completed audit, no production code changes

---

## Executive Summary

Korix already has the building blocks for cancellation, but propagation is incomplete.

Current state:

- `AgentLoop` checks cancellation between iterations and inside provider stream processing.
- `AgentLoop` timeout calls `CancellationManager.cancel()`.
- `CancellationManager` exposes `getSignal()` and emits `cancelled`.
- `RequestContext` already has optional `signal?: AbortSignal`.
- LiteLLM transport/client can consume `AbortSignal`.
- `ToolScheduler` can merge task abort signals.

Main gap:

- `ExecutionEngine` does not pass `cancellationManager.getSignal()` into provider `RequestContext`.
- `ExecutionEngine` tool execution does not propagate scheduler abort signals into tools.
- `ToolContext` has no cancellation signal contract.
- Parent agent cancellation is not linked to child subagent cancellation managers.

## Current Flow

### Runtime Timeout

`AgentLoop.runStepWithTimeout()` races an execution step against a timer. When the timer fires, it calls:

```ts
this.cancellationManager.cancel(
  `Execution timed out after ${timeoutMs}ms`,
  state.getExecution().currentIteration,
)
```

This aborts the manager's internal `AbortController`, runs cleanup callbacks, and emits a `cancelled` event.

### Runtime Checks

Cancellation is checked:

- at the start of every `AgentLoop` iteration.
- while consuming provider stream events in `ExecutionEngine.step()`.
- before processing each pending tool call in `ExecutionEngine.executeToolCalls()`.

### Provider Support

`RequestContext` includes:

```ts
readonly signal?: AbortSignal;
```

`LiteLLMProvider` passes `context.signal` to `LiteLLMClient.streamMessages()`.

`LiteLLMClient` passes the signal to transport and cancels the SSE reader when the signal is aborted.

`HttpTransport` passes `signal` to `fetch`.

`TimeoutTransport` merges timeout signal and user signal.

### Tool Support

`ToolScheduler` accepts `ScheduledTask.abortSignal`, creates per-task timeout signals, and merges them before calling the executor.

However, `ExecutionEngine` currently defines the scheduler executor as:

```ts
const executor = async (tool: string, input: unknown) => {
  return await this.toolRegistry.execute(tool, input, toolContext);
};
```

That drops the scheduler signal.

`ToolContext` also has no `signal` field, so individual tools cannot observe runtime cancellation consistently.

## Findings

### Finding 1: Provider abort is wired below the provider boundary but not from runtime to provider

Impact: a timed-out `AgentLoop` can return a timeout failure while the underlying provider request may continue until the provider stream yields again or the HTTP request finishes.

Recommended next fix:

- Pass `this.cancellationManager.getSignal()` into `RequestContext.signal` in `ExecutionEngine.step()`.
- Add a focused test proving provider receives an aborted signal when `AgentLoop` timeout fires.

### Finding 2: Child subagents use independent cancellation managers

Impact: parent cancellation does not automatically cancel a running child subagent unless the child reaches its own timeout or checks its own manager.

Recommended follow-up:

- Link parent cancellation to child cancellation through cleanup callbacks or shared parent signal.
- Keep this separate from provider abort because it changes nested runtime lifecycle semantics.

### Finding 3: Tool scheduler signal is not passed into tools

Impact: tool-level timeouts/cancellations can reject scheduler tasks, but tools cannot cooperatively stop work unless they have their own independent timeout mechanism.

Recommended follow-up:

- Extend `ToolContext` with `readonly signal?: AbortSignal`.
- Update `ToolRegistry.execute()` and `ExecutionEngine` scheduler executor to pass the signal.
- Start with tools that already support abort-like behavior: `WebFetch`, `Await`, and terminal/background commands.

### Finding 4: Terminal command cancellation is session-level, not runtime-signal aware

Impact: foreground terminal commands rely on command timeout, not agent cancellation. Background commands self-timeout and can be killed by session id, but runtime cancellation does not currently kill active sessions.

Recommended follow-up:

- Register cleanup callbacks for active terminal sessions or expose signal-aware command execution.
- Avoid broad terminal changes until provider abort and tool-context signal are in place.

## Decision

The next implementation should be:

**Fase 5.3: Provider Abort Propagation**

Reason:

- It is the narrowest high-impact fix.
- The provider stack already has signal support.
- It reduces wasted tokens/network work when subagent timeout fires.
- It does not require changing every tool contract yet.

## Proposed 5.3 Scope

- Pass `CancellationManager.getSignal()` into provider `RequestContext.signal`.
- Add a unit test around `ExecutionEngine` or `AgentLoop` proving the provider receives the runtime signal.
- Add a timeout test proving the signal becomes aborted after `AgentLoop` timeout.
- Do not change `ToolContext` yet.
- Do not change terminal session cleanup yet.

## Out of Scope for 5.3

- Tool-context signal propagation.
- Parent-child subagent cancellation linkage.
- Terminal session kill-on-cancel.
- Retry/recovery redesign.
- Streaming progress changes.
