# Terminal Session Cleanup Audit

**Date**: 2026-05-22

**Scope**: Tools Roadmap Fase 5.6

**Status**: Completed audit, no production code changes

---

## Executive Summary

Korix already has session-level cleanup for background commands when their own timeout expires, but agent cancellation should not automatically kill terminal sessions yet.

Current state:

- `RunCommand(background: true)` creates or reuses a terminal session through `CommandRunner`.
- `CommandRunner` tracks background sessions in memory with output, exit status and a timeout handle.
- Background commands are wrapped with an internal exit marker so Korix can detect command completion without waiting synchronously.
- Background command timeout currently calls `TerminalSessionManager.killSession(sessionId)`.
- `Await` now observes `ToolContext.signal` and can stop polling cooperatively.
- `Await` cancellation does not kill the terminal process.

Main decision:

**Do not auto-kill terminal sessions when `Await` or the parent agent is cancelled.**

Reason:

- A terminal session can be reused by multiple commands.
- `Await` is a polling/observation tool, not ownership of the underlying process.
- Killing a session on agent cancellation could terminate useful user work unexpectedly.
- Existing background timeout already provides a bounded cleanup path for commands started in background mode.

## Current Lifecycle

### Starting a Background Command

`RunCommandTool` calls `CommandRunner.run(command, { background: true })`.

`CommandRunner.run()` validates the command and delegates to `runInBackground()`.

`runInBackground()`:

- creates or reuses a terminal session.
- creates a `BackgroundSession` record.
- clears PTY output.
- attaches `onData` and `onExit` callbacks.
- writes the command wrapped with an internal exit marker.
- returns immediately with `background: true` and `sessionId`.

### Detecting Completion

The command is written as:

```sh
<command>
printf '\n__KORIX_BACKGROUND_EXIT_<sessionId>:%s__\n' "$?"
```

When PTY output contains that marker:

- `exitCode` is parsed.
- `exited` becomes `true`.
- the background timeout is cleared.
- the marker is removed from user-visible output.

### Timeout Cleanup

Each background session has a timeout. When it fires:

- Korix logs `Background command timed out`.
- `TerminalSessionManager.killSession(sessionId)` is called.
- `session.exited` becomes `true`.

This means command-owned timeout already has a hard cleanup path.

### Await Polling

`AwaitTool` calls `CommandRunner.getSessionStatus(sessionId)` repeatedly until:

- the pattern matches.
- the command exits.
- `Await` times out.
- `ToolContext.signal` aborts.

After Fase 5.5, `Await` abort stops polling but does not kill the terminal session.

## Findings

### Finding 1: Background timeout already kills the terminal session

Impact: Korix is not leaving background commands unbounded by default. The command timeout is the current hard cleanup mechanism.

Recommendation: preserve this behavior.

### Finding 2: Await does not own process lifetime

Impact: Killing the terminal session when `Await` is cancelled would conflate observation with ownership.

Recommendation: keep `Await` cancellation as polling cancellation only.

### Finding 3: Session reuse makes implicit kill risky

Impact: `CommandRunner` can reuse a provided `sessionId`. A cancellation from one agent/tool call could kill a session that has accumulated user context or additional commands.

Recommendation: avoid automatic kill-on-agent-cancel until ownership is explicit.

### Finding 4: There is no explicit tool for controlled termination

Impact: If the agent intentionally starts a long-running background command and later decides it should stop, it lacks a first-class tool to do so.

Recommendation: add an explicit, approval-aware terminal/session termination capability in a separate phase.

## Decision

The next implementation should be:

**Fase 5.7: Explicit Terminal Session Termination**

Reason:

- It gives the agent a clear, auditable way to stop background work.
- It avoids destructive behavior hidden inside cancellation.
- It matches the existing `TerminalSessionManager.killSession(sessionId)` capability.
- It can require approval and be limited to `agent` mode.

## Proposed 5.7 Scope

- Add an explicit tool, tentatively `TerminateSession`.
- Input: `sessionId`.
- Allowed only in `agent` mode.
- Requires approval.
- Calls `TerminalSessionManager.killSession(sessionId)` through a narrow `CommandRunner` method or direct terminal service boundary.
- Returns structured success/failure.
- Test unknown session, successful termination, mode restrictions and approval requirement.

## Out of Scope for 5.7

- Auto-kill on `Await` cancellation.
- Auto-kill on parent agent cancellation.
- Killing process groups beyond the current PTY/session kill behavior.
- Persistent background session registry.
- UI for session management.
