# Security

This document describes the security model of the Korix Code VSCode extension — how it controls which actions the AI agent may take, how it gates user approval, and where the trust boundaries lie.

## Architecture Overview

The security model is layered across four subsystems:

```
User Request
    │
    ▼
PermissionManager      ← allowlist / denylist per tool
    │
    ▼
ExecutionPolicy        ← risk classification per action type
    │
    ▼
ToolRegistry           ← schema validation + mode enforcement
    │
    ▼
ExecutionSandbox       ← timeout + error containment
    │
    ▼
CommandRunner          ← regex denylist / approval list for shell commands
```

## Permission System

**Source:** `src/harness/permissions.ts`

`PermissionManager` tracks per-tool rules with four levels:

| Level    | Behaviour                                       |
|----------|-------------------------------------------------|
| `always` | Auto-approve every invocation                   |
| `once`   | Approve this invocation, then delete the rule   |
| `never`  | Silently block every invocation                 |
| `ask`    | Prompt user on every invocation                 |

Rules may carry an `expiresAt` timestamp; expired rules are pruned before each check.

### Default Denylist

The following strings are hard-blocked regardless of any user-configured rule (checked against both tool name and serialised input):

```
rm -rf
sudo
curl | bash
wget | sh
:(){ :|:& };:    # fork bomb
dd if=/dev/zero
mkfs
fdisk
```

### Approval Modal

When a tool has no rule (or its rule is `ask`), a modal dialog is shown with the risk level and description:

- **✅ Approve Once** — single-use approval, no rule stored
- **Always Allow** — stores `level: "always"` rule
- **Reject** — denies this invocation, no rule stored
- **Never Allow** — stores `level: "never"` rule

Risk levels (`low` / `medium` / `high`) are surfaced as emoji indicators in the modal title.

## Execution Policies

**Source:** `src/harness/executionPolicy.ts`

Each tool is mapped to an `ExecutionPolicy` that declares:

| Tool            | Action    | Risk     | Requires Approval | Read-only Mode |
|-----------------|-----------|----------|-------------------|----------------|
| `ReadFile`      | read      | low      | No                | Yes            |
| `WriteFile`     | write     | medium   | Yes               | No             |
| `DeleteFile`    | delete    | high     | Yes               | No             |
| `RunCommand`    | execute   | high     | Yes               | No             |
| `NetworkRequest`| network   | medium   | Yes               | Yes            |

Unknown tools default to `execute / medium / requiresApproval: true / readOnly: false`.

## Tool Registry & Schema Validation

**Source:** `src/harness/toolRegistry.ts`

Every tool call goes through `ToolRegistry.execute()`:

1. **Tool existence check** — unknown tool names return an error without execution.
2. **Mode enforcement** — `tool.allowedInMode(mode)` gates availability per execution mode. For example, `WriteFile` is only available in `agent` mode; `ReadFile` and `ListDirectory` are available in all modes.
3. **Schema validation** — input is parsed against a Zod schema before the tool handler is called. Invalid input is rejected with a structured error.
4. **Metadata tracking** — every result includes `approved`, `duration`, and `timestamp`.

## Execution Sandbox

**Source:** `src/harness/sandbox.ts`

`ExecutionSandbox` wraps any async function in a `Promise.race` timeout:

- Default timeout: **30 seconds**
- Configurable per call via `SandboxOptions.timeout`
- Timed-out executions are surfaced as `{ success: false, timedOut: true }` — they do not throw.

## Terminal / Shell Security

**Source:** `src/terminal/commandRunner.ts`

`CommandRunner` enforces two separate lists before any PTY write:

### Hard Denylist (execution blocked)

```
/rm\s+-rf\s+\//
/dd\s+if=/
/mkfs/
/format\s+[a-z]:/i
/curl.*\|\s*bash/
/wget.*\|\s*sh/
/:\(\)\{\s*:\|:&\s*\};:/
```

Any command matching these patterns throws immediately — no user prompt is shown.

### Requires-Approval List (user must confirm)

```
/rm\s+-rf/
/sudo/
/su\s+/
/shutdown/
/reboot/
/git\s+push\s+--force/
/npm\s+publish/
/docker\s+system\s+prune/
```

Commands matching these patterns return `{ allowed: true, requiresApproval: true }` and the caller must obtain explicit user consent before proceeding.

### Timeout Limits

| Setting          | Value   |
|------------------|---------|
| Default timeout  | 30 s    |
| Maximum timeout  | 5 min   |

The effective timeout is `min(requested, maxTimeout)`.

## API Key Storage

**Source:** `src/providers/config.ts`

API keys are stored using the VSCode `SecretStorage` API (`context.secrets`), which encrypts secrets using the OS credential manager (Keychain on macOS, Credential Vault on Windows, libsecret on Linux). Keys are never written to workspace settings files.

Fallback: if a key is found in plaintext workspace configuration (`korix.<provider>.apiKey`), it is migrated to `SecretStorage` on first read and should be removed from settings manually.

Keys are scoped by provider type with the prefix `korix.apiKey.<provider>`.

## Mode-Based Access Control

The extension operates in three modes with escalating capability:

| Mode    | File reads | File writes | Shell commands | Network |
|---------|-----------|-------------|----------------|---------|
| `ask`   | Yes       | No          | No             | Read-only |
| `plan`  | Yes       | No          | No             | Read-only |
| `agent` | Yes       | Yes         | Yes (gated)    | Yes (gated) |

## Agent Loop Safeguards

**Source:** `src/core/runtime/agentLoop.ts`

- **Iteration cap** — configurable `maxIterations` (default 25 via `korix.maxIterations`). The loop stops when the cap is reached even if the agent still has pending tool calls.
- **Abort signal** — `AgentLoop.cancel()` sets an `AbortController` signal checked at the top of every iteration, allowing immediate user cancellation.
- **Checkpoints** — after each iteration that produced tool calls, `CheckpointManager.save()` snapshots the runtime state. Any checkpoint can be restored via `AgentLoop.rollback(checkpointId)`.

## Known Limitations

- The denylist in `PermissionManager` is a substring/string match; the regex-based denylist in `CommandRunner` is more robust. Sufficiently obfuscated shell commands (e.g. variable expansion) may bypass substring matching.
- `ExecutionSandbox` applies only a time limit. It does not restrict filesystem access, memory usage, or network calls beyond what the tool's own policy enforces.
- The `always` permission level is stored in memory for the session only; it is not persisted to disk and resets when the extension host restarts.
