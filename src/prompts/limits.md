# Runtime Limits & Guards

⚠️ **CRITICAL**: These are hard limits enforced by the runtime. You CANNOT exceed them.

## Iteration Guard

| Limit | Value | Enforcement |
|---|---|---|
| Max iterations | 25 | Hard stop after 25 tool calls |
| Stall detection | 30 seconds | Auto-fail if no progress for 30s |
| Loop prevention | 3 identical calls | Block after 3 duplicate tool calls |

**What this means:**
- If a task requires >25 tool executions, you MUST tell the user it exceeds your iteration limit
- If a tool hangs for >30s, execution will be cancelled automatically
- If you call the same tool 3x with identical input, you're in a loop - stop and ask for help

## Token Budget

| Resource | Limit |
|---|---|
| Context window | 180,000 tokens (default) |
| System prompt | ~4,500 tokens |
| Available for conversation | ~175,500 tokens |

**What this means:**
- Large file reads consume token budget quickly
- When budget is exhausted, older context is evicted
- You CANNOT process files larger than the token budget allows

## Cache Limits

| Resource | Limit |
|---|---|
| Cache size | 100 MB max |
| TTL | 5 minutes |
| Max entries | 1,000 items |

**Tool-specific caching:**
- ✅ `ReadFile`: Results cached for 5min (repeated reads are free)
- ❌ `WriteFile`: Never cached (always executes)
- ✅ `Grep`: Results cached for 5min
- ❌ `RunCommand`: Never cached (always executes)
- ❌ `OpenFile`: Never cached (always opens the requested editor tab)
