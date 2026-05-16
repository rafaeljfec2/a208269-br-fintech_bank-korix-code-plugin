# Korix Code — Configuration Reference

All settings live under the `korix` namespace in VSCode's configuration (`settings.json`). They can be set at user or workspace scope.

---

## Provider

### `korix.provider`

Selects the active LLM backend.

| Field | Value |
|---|---|
| Type | `string` |
| Allowed | `"anthropic"` \| `"openai"` \| `"ollama"` \| `"openrouter"` |
| Default | `"anthropic"` |

```json
{ "korix.provider": "anthropic" }
```

Only the provider matching this value is active. Settings for other providers are ignored at runtime.

---

## Anthropic

### `korix.anthropic.apiKey`

API key for Anthropic. When set in `settings.json`, the extension migrates it to VSCode's encrypted secret store on first load and clears the plaintext value. Prefer setting the key through the **Korix: Set API Key** prompt instead of committing it to `settings.json`.

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` |
| Storage | VSCode `SecretStorage` (after first read) |

```json
{ "korix.anthropic.apiKey": "sk-ant-..." }
```

### `korix.anthropic.model`

Anthropic model identifier.

| Field | Value |
|---|---|
| Type | `string` |
| Allowed | `"claude-opus-4-7"` \| `"claude-sonnet-4-6"` \| `"claude-haiku-4-5-20251001"` |
| Default | `"claude-sonnet-4-6"` |

```json
{ "korix.anthropic.model": "claude-opus-4-7" }
```

### `korix.anthropic.baseUrl`

Overrides the Anthropic API base URL. Useful for proxies or local mirrors. When absent, the SDK default (`https://api.anthropic.com`) is used.

| Field | Value |
|---|---|
| Type | `string` |
| Default | _(SDK default)_ |

```json
{ "korix.anthropic.baseUrl": "https://my-proxy.example.com" }
```

---

## OpenAI

### `korix.openai.apiKey`

API key for OpenAI. Follows the same secure-storage migration as the Anthropic key.

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` |

### `korix.openai.model`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"gpt-4-turbo"` |

### `korix.openai.baseUrl`

Overrides the OpenAI base URL. Useful for Azure OpenAI endpoints or compatible APIs.

| Field | Value |
|---|---|
| Type | `string` |
| Default | _(SDK default)_ |

---

## Ollama

### `korix.ollama.apiKey`

Not required for a local Ollama instance. Set if your deployment requires authentication.

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` |

### `korix.ollama.model`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"llama2"` |

### `korix.ollama.baseUrl`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"http://localhost:11434"` |

```json
{ "korix.ollama.baseUrl": "http://localhost:11434" }
```

---

## OpenRouter

### `korix.openrouter.apiKey`

API key for OpenRouter. Follows the same secure-storage migration as the Anthropic key.

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` |

### `korix.openrouter.model`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"anthropic/claude-sonnet-4"` |

### `korix.openrouter.baseUrl`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"https://openrouter.ai/api/v1"` |

---

## Shared Provider Options

These settings apply to whichever provider is active.

### `korix.maxTokens`

Maximum tokens the provider may generate per response. When absent, the provider uses its own default.

| Field | Value |
|---|---|
| Type | `number` |
| Default | _(provider default)_ |

### `korix.temperature`

Sampling temperature. When absent, the provider uses its own default.

| Field | Value |
|---|---|
| Type | `number` |
| Default | _(provider default)_ |

---

## Agent Runtime

### `korix.maxIterations`

Maximum number of agentic loop iterations before the run is terminated. Each iteration corresponds to one LLM call plus any resulting tool executions. Raising this allows longer autonomous tasks at the cost of increased API spend.

| Field | Value |
|---|---|
| Type | `number` |
| Default | `25` |

```json
{ "korix.maxIterations": 25 }
```

### `korix.contextTokenBudget`

Token ceiling for the context window fed to the model. The context engine uses this budget to rank and trim workspace files, git state, and conversation history before each call. The default of `180000` fits well within Claude Sonnet's 200k context.

| Field | Value |
|---|---|
| Type | `number` |
| Default | `180000` |

```json
{ "korix.contextTokenBudget": 180000 }
```

---

## Terminal

### `korix.terminal.defaultTimeout`

Maximum milliseconds a terminal command may run before being killed. Applies to all `RunCommand` tool invocations from the agent.

| Field | Value |
|---|---|
| Type | `number` (ms) |
| Default | `30000` (30 s) |

```json
{ "korix.terminal.defaultTimeout": 30000 }
```

---

## Approval Flow

### `korix.approvalFlow.enabled`

When `true`, the extension shows an interactive approval modal before executing any action whose execution policy sets `requiresApproval: true`. Disabling this grants the agent fully autonomous execution without per-action confirmation.

| Field | Value |
|---|---|
| Type | `boolean` |
| Default | `true` |

```json
{ "korix.approvalFlow.enabled": true }
```

Actions requiring approval by default:

| Tool | Risk Level |
|---|---|
| `WriteFile` | medium |
| `DeleteFile` | high |
| `RunCommand` | high |
| `NetworkRequest` | medium |

`ReadFile` never requires approval and can run in read-only mode.

---

## Telemetry

### `korix.telemetry.enabled`

Enables structured logging and performance metrics via [pino](https://getpino.io). Logs are written to the VSCode Output panel (`Korix Code` channel) and include token usage, iteration counts, and tool call latencies. No data is sent to external servers.

| Field | Value |
|---|---|
| Type | `boolean` |
| Default | `true` |

```json
{ "korix.telemetry.enabled": true }
```

---

## Minimal Configuration Examples

### Anthropic (default)

```json
{
  "korix.provider": "anthropic",
  "korix.anthropic.model": "claude-sonnet-4-6",
  "korix.maxIterations": 25,
  "korix.contextTokenBudget": 180000,
  "korix.approvalFlow.enabled": true
}
```

### Ollama (local, no approval)

```json
{
  "korix.provider": "ollama",
  "korix.ollama.model": "llama3",
  "korix.ollama.baseUrl": "http://localhost:11434",
  "korix.approvalFlow.enabled": false,
  "korix.maxIterations": 10
}
```

### OpenRouter with higher budget

```json
{
  "korix.provider": "openrouter",
  "korix.openrouter.model": "anthropic/claude-opus-4",
  "korix.maxIterations": 50,
  "korix.contextTokenBudget": 200000
}
```

---

## API Key Security

API keys set via `settings.json` are automatically migrated to VSCode `SecretStorage` on first activation. After migration the plaintext value in `settings.json` is still present until the user removes it — it is recommended to delete the key from `settings.json` once the extension has stored it securely.

The preferred approach is to never put keys in `settings.json` at all: the extension will prompt for the key interactively when a provider is first used.

Keys are stored under the namespace `korix.apiKey.<provider>` inside `SecretStorage` and are never logged or included in telemetry output.
