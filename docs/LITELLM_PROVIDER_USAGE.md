# LiteLLM Provider - Guia de Uso

## Visão Geral

O LiteLLM Provider integra o Korix Code com o proxy LiteLLM da Thomson Reuters, permitindo acesso a múltiplos vendors de LLM (Anthropic Claude, OpenAI GPT, Google Gemini) através de uma única API unificada.

**IMPORTANTE**: O LiteLLM TR usa **Anthropic Messages API format** (`/v1/messages`), **NÃO** OpenAI format (`/v1/chat/completions`).

## Arquitetura

```
ProviderInput → LiteLLMProvider → LiteLLMClient → Transport Chain → LiteLLM TR Proxy
                                                                    ↓
                ProviderEvent ← Normalizer ← SSE Parser ← Anthropic Messages API
```

### Componentes

- **LiteLLMProvider**: Stateless provider que converte `ProviderInput` para `AnthropicMessagesRequest`
- **LiteLLMClient**: HTTP client que usa Transport middleware
- **LiteLLMNormalizer**: Converte eventos Anthropic para `ProviderEvent` canônicos
- **SSEParser**: Parser incremental de Server-Sent Events
- **Transport Chain**: Middleware composable (Auth, Retry, Circuit Breaker, Tracing, Metrics)

## Configuração

### 1. Variáveis de Ambiente

```bash
# .bashrc ou .zshrc
export ANTHROPIC_AUTH_TOKEN="sua-chave-aqui"
export ANTHROPIC_BASE_URL="https://litellm.int.thomsonreuters.com"
export ANTHROPIC_MODEL="anthropic/claude-sonnet-4-6"
```

**Obrigatório**:
- `ANTHROPIC_AUTH_TOKEN`: API key do LiteLLM TR (lifetime: 90 dias)
- Acesso via Z-scaler habilitado

**Opcional**:
- `ANTHROPIC_BASE_URL`: Default `https://litellm.int.thomsonreuters.com`
- `ANTHROPIC_MODEL`: Default `anthropic/claude-opus-4-7`

### 2. Provider Config

```typescript
import type { ProviderConfig } from "./src/providers/types";

const config: ProviderConfig = {
  type: "litellm",
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN!,
  baseUrl: "https://litellm.int.thomsonreuters.com", // NO trailing slash!
  model: "anthropic/claude-sonnet-4-6",              // Vendor prefix REQUIRED
  maxTokens: 8192,
  temperature: 1.0,
};
```

**Modelos Suportados** (vendor prefix obrigatório):
- `anthropic/claude-opus-4-7` (mais capaz)
- `anthropic/claude-sonnet-4-6` (balanceado)
- `anthropic/claude-haiku-4-5` (rápido)
- `openai/gpt-4o` (OpenAI via proxy)
- `gemini/gemini-2.0-flash-exp` (Google via proxy)

### 3. Transport Chain

```typescript
import { TransportBuilder } from "./src/core/providers/transport";

const transport = new TransportBuilder()
  .withAuth({
    header: "Authorization",  // LiteLLM TR requer Authorization: Bearer
    token: config.apiKey,
  })
  .withTimeout(120000)
  .withRetry({
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  })
  .withCircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    openDuration: 60000,
    halfOpenMaxRequests: 1,
  })
  .withTracing()
  .withMetrics((metric) => {
    console.log("Request metric:", metric);
  })
  .build();
```

### 4. Criar Provider

```typescript
import { LiteLLMProvider } from "./src/core/providers/litellm";

const provider = new LiteLLMProvider(config, transport);
```

## Uso Básico

### Stream de Texto Simples

```typescript
const stream = provider.send(
  {
    messages: [
      {
        role: "user",
        content: "Qual é a capital do Brasil?",
        timestamp: Date.now(),
      },
    ],
    system: "Você é um assistente útil.",
    maxTokens: 200,
  },
  {
    correlationId: crypto.randomUUID(),
    sessionId: "session-123",
    agentRunId: "run-456",
    iterationId: 1,
  },
);

for await (const event of stream) {
  switch (event.type) {
    case "token":
      process.stdout.write(event.value);
      break;

    case "usage":
      console.log("Usage:", {
        input: event.inputTokens,
        output: event.outputTokens,
      });
      break;

    case "finish":
      console.log("\nFinish reason:", event.reason);
      break;

    case "error":
      console.error("Error:", event.error.message);
      break;
  }
}
```

### Com Tool Calling

```typescript
import type { ToolDefinition } from "./src/providers/types";

const tools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name",
        },
      },
      required: ["location"],
    },
  },
];

const stream = provider.send(
  {
    messages: [
      {
        role: "user",
        content: "What's the weather in São Paulo?",
        timestamp: Date.now(),
      },
    ],
    system: "You are a helpful assistant with access to weather data.",
    tools,
    maxTokens: 1024,
  },
  {
    correlationId: crypto.randomUUID(),
    sessionId: "session-123",
  },
);

for await (const event of stream) {
  switch (event.type) {
    case "tool_call_delta":
      console.log("Tool delta:", {
        index: event.index,
        id: event.id,
        name: event.name,
        chunk: event.argumentsChunk,
      });
      break;

    case "tool_call_complete":
      console.log("Tool complete:", {
        id: event.id,
        name: event.name,
        arguments: event.arguments,
      });
      // Executar tool aqui...
      break;
  }
}
```

## Provider Events

### Tipos de Eventos

```typescript
type ProviderEvent =
  | TokenEvent          // Texto incremental
  | ThinkingEvent       // Thinking (Claude Extended Thinking)
  | ToolCallDeltaEvent  // Delta de tool call (JSON fragmentado)
  | ToolCallCompleteEvent // Tool call completo (JSON válido)
  | UsageEvent          // Token usage (input/output)
  | FinishEvent         // Fim da stream
  | ErrorEvent;         // Erro
```

### Token Event

```typescript
{
  type: "token",
  value: "Hello",
  timestamp: 1234567890,
  correlation: { correlationId, sessionId, ... }
}
```

### Tool Call Delta Event

```typescript
{
  type: "tool_call_delta",
  index: 0,
  id: "toolu_abc123",           // Vem no primeiro delta
  name: "get_weather",          // Vem no primeiro delta
  argumentsChunk: "{\"location", // JSON fragmentado
  timestamp: 1234567890,
  correlation: { ... }
}
```

### Tool Call Complete Event

```typescript
{
  type: "tool_call_complete",
  index: 0,
  id: "toolu_abc123",
  name: "get_weather",
  arguments: "{\"location\":\"São Paulo\"}", // JSON completo
  timestamp: 1234567890,
  correlation: { ... }
}
```

### Usage Event

```typescript
{
  type: "usage",
  inputTokens: 150,
  outputTokens: 50,
  cacheReadTokens: 0,     // Prompt caching (se habilitado)
  cacheWriteTokens: 0,
  timestamp: 1234567890,
  correlation: { ... }
}
```

### Finish Event

```typescript
{
  type: "finish",
  reason: "stop" | "max_tokens" | "tool_calls" | "error",
  timestamp: 1234567890,
  correlation: { ... }
}
```

### Error Event

```typescript
{
  type: "error",
  error: {
    message: "Rate limit exceeded",
    type: "RateLimitError",
  },
  timestamp: 1234567890,
  correlation: { ... }
}
```

## Anthropic Messages API Format

### Request Format

```typescript
interface AnthropicMessagesRequest {
  model: string;                              // "anthropic/claude-sonnet-4-6"
  max_tokens: number;
  messages: AnthropicMessage[];              // User/assistant only
  system?: string | AnthropicContentBlock[]; // System é campo separado
  tools?: AnthropicTool[];
  temperature?: number;
  stream: boolean;
}
```

**Diferenças do OpenAI**:
- ✅ `system` é campo **separado**, não é uma mensagem
- ✅ `messages` só aceita `user` e `assistant` (tool results são enviados como user messages)
- ✅ `max_tokens` obrigatório (OpenAI: opcional)
- ✅ Tools sem wrapper `function` (schema direto)

### Response Format (SSE)

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","model":"claude-sonnet-4-6",...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":50}}

event: message_stop
data: {"type":"message_stop"}
```

## Resiliência

### Circuit Breaker

Previne cascading failures em caso de falhas consecutivas:

```typescript
// Estados: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)

if (circuitBreaker.state === "OPEN") {
  throw new CircuitBreakerOpenError(
    "Circuit breaker open for anthropic/claude-sonnet-4-6"
  );
}
```

**Política Default**:
- 5 falhas consecutivas → OPEN
- 60s em OPEN → HALF_OPEN
- 2 sucessos consecutivos em HALF_OPEN → CLOSED

### Retry Policy

Exponential backoff com jitter:

```typescript
// Retry em: 408, 429, 500, 502, 503, 504
// Delays: 1s → 2s → 4s (max 3 tentativas)
```

### Backpressure

Previne memory explosion em streaming:

```typescript
// Max queue: 1000 eventos
// Warning em: 500 eventos (slow consumer)
// Auto-pause se queue cheia
```

## Observabilidade

### Correlation IDs

Todos os eventos carregam correlation context:

```typescript
{
  correlationId: "uuid-xyz",  // Único por request
  sessionId: "session-123",   // VSCode session
  agentRunId: "run-456",      // AgentLoop run
  iterationId: 3,             // Iteration number
}
```

### Métricas

```typescript
transport.withMetrics((metric) => {
  console.log({
    url: metric.url,
    method: metric.method,
    status: metric.status,
    duration: metric.duration, // ms
    success: metric.success,
  });
});
```

### Tracing

```typescript
// Headers automáticos em todos os requests:
{
  "x-correlation-id": correlationId,
  "x-session-id": sessionId,
  "x-agent-run-id": agentRunId,
  "x-iteration-id": iterationId,
}
```

## Errors

### Error Hierarchy

```typescript
// Base
class LiteLLMError extends Error {
  readonly code: string;
  readonly statusCode?: number;
}

// Específicos
class RateLimitError extends LiteLLMError        // 429
class AuthenticationError extends LiteLLMError   // 401, 403
class BudgetExceededError extends LiteLLMError   // 400 + budget message
class ModelNotFoundError extends LiteLLMError    // 404
class CircuitBreakerOpenError extends LiteLLMError
class LiteLLMStreamingError extends LiteLLMError
```

### Error Handling

```typescript
try {
  const stream = provider.send(input, context);
  for await (const event of stream) {
    if (event.type === "error") {
      console.error("Stream error:", event.error);
    }
  }
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log("Retry after:", error.retryAfter);
  } else if (error instanceof BudgetExceededError) {
    console.log("Budget exceeded. Contact TR LiteLLM support.");
  } else if (error instanceof CircuitBreakerOpenError) {
    console.log("Service temporarily unavailable. Try again later.");
  }
}
```

## Limites TR LiteLLM

- **Budget**: $1000/mês por usuário
- **Rate Limit**: Varia por modelo
- **API Key Lifetime**: 90 dias (renovar periodicamente)
- **Network**: Requer Z-scaler habilitado

## Links

- **Dashboard**: https://litellm.int.thomsonreuters.com/ui
- **Self-Service**: https://litellm-self-service.8663.aws-int.thomsonreuters.com
- **Support**: MS Teams - LiteLLM Support
- **Docs**: https://docs.litellm.ai

## Troubleshooting

### 403 Forbidden

```bash
# ❌ ERRADO: x-api-key ou x-litellm-api-key
curl -H "x-api-key: $TOKEN" https://litellm.int.thomsonreuters.com/v1/chat/completions

# ✅ CORRETO: Authorization Bearer + Anthropic Messages API
curl -H "Authorization: Bearer $TOKEN" \
     -H "anthropic-version: 2023-06-01" \
     -H "User-Agent: claude-cli/2.1.78 (external, sdk-cli)" \
     https://litellm.int.thomsonreuters.com/v1/messages
```

### Model Not Found

```typescript
// ❌ ERRADO: sem vendor prefix
model: "claude-sonnet-4-6"

// ✅ CORRETO: vendor prefix obrigatório
model: "anthropic/claude-sonnet-4-6"
```

### Budget Exceeded

```json
{
  "error": {
    "message": "Budget has been exceeded! Current spend: $1050; Max budget: $1000",
    "type": "BudgetExceededError",
    "code": "budget_exceeded"
  }
}
```

**Solução**: Contatar TR LiteLLM support para ajuste de budget.

### Circuit Breaker Open

```
CircuitBreakerOpenError: Circuit breaker open for anthropic/claude-sonnet-4-6
```

**Causa**: 5+ falhas consecutivas  
**Solução**: Aguardar 60s para HALF_OPEN, ou investigar causa raiz (budget, network, API down)

## Exemplos Completos

Ver:
- `scripts/test-litellm.ts` - Script de teste manual
- `scripts/run-test.sh` - Shell script que carrega variáveis do .bashrc
- `docs/TESTING_LITELLM.md` - Guia de testes completo
