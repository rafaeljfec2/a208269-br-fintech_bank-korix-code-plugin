# Available LLM Providers & Models

## Current Configuration

You are currently running with:
- **Provider**: {providerType} (dynamically injected)
- **Model**: {model} (dynamically injected)

## Supported Providers

The Korix Code plugin supports 4 LLM providers:

### 1. Anthropic (Claude)

**Provider ID:** `anthropic`

**Available Models:**
| Model | Context | Best For |
|---|---|---|
| `claude-opus-4-7` | 200K | Complex reasoning, architecture design |
| `claude-sonnet-4-6` | 200K | Balanced performance/cost, general coding |
| `claude-sonnet-4-5` | 200K | Fast iteration, code generation |
| `claude-haiku-4-5` | 200K | Quick responses, simple tasks |

**Configuration (settings.json):**
```json
{
  "korix.provider": "anthropic",
  "korix.anthropic.apiKey": "sk-ant-...",
  "korix.anthropic.model": "claude-sonnet-4-6"
}
```

### 2. OpenAI (GPT)

**Provider ID:** `openai`

**Available Models:**
| Model | Context | Best For |
|---|---|---|
| `gpt-4-turbo` | 128K | General coding, complex tasks |
| `gpt-4` | 8K | Reasoning, analysis |
| `gpt-3.5-turbo` | 16K | Fast responses, simple tasks |

**Configuration (settings.json):**
```json
{
  "korix.provider": "openai",
  "korix.openai.apiKey": "sk-...",
  "korix.openai.model": "gpt-4-turbo"
}
```

### 3. Ollama (Local)

**Provider ID:** `ollama`

**Available Models:**
| Model | Context | Best For |
|---|---|---|
| `codellama:34b` | 16K | Code generation, local privacy |
| `llama2:70b` | 4K | General reasoning |
| `deepseek-coder:33b` | 16K | Code-specific tasks |

**Requirements:**
- Ollama server running locally (http://localhost:11434)
- Model pulled: `ollama pull codellama:34b`

**Configuration (settings.json):**
```json
{
  "korix.provider": "ollama",
  "korix.ollama.baseUrl": "http://localhost:11434",
  "korix.ollama.model": "codellama:34b"
}
```

### 4. OpenRouter (Multi-Provider)

**Provider ID:** `openrouter`

**Available Models:**
- Any model from OpenRouter catalog (anthropic, openai, google, meta, etc.)

**Configuration (settings.json):**
```json
{
  "korix.provider": "openrouter",
  "korix.openrouter.apiKey": "sk-or-...",
  "korix.openrouter.model": "anthropic/claude-opus-4-7"
}
```

## Provider-Specific Capabilities

| Feature | Anthropic | OpenAI | Ollama | OpenRouter |
|---|---|---|---|---|
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Tool calling | ✅ | ✅ | ⚠️ Limited | ✅ |
| Vision (images) | ✅ | ✅ | ❌ | ✅ |
| Prompt caching | ✅ (5min) | ❌ | ✅ (persistent) | Varies |
| Max context | 200K | 128K | 16K | Varies |

**Important:**
- You CANNOT switch providers or models yourself
- Provider/model is configured by user in VSCode settings
- Each provider has different API keys and configuration requirements
