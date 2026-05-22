# 🧪 Guia de Teste do LiteLLM Provider

**IMPORTANTE**: O LiteLLM TR usa **Anthropic Messages API** (`/v1/messages`), NÃO OpenAI format (`/v1/chat/completions`).

## Pré-requisitos

### 1. Obter API Key Thomson Reuters

1. Acesse o **LiteLLM Self-Service Portal**:
   ```
   https://litellm-self-service.8663.aws-int.thomsonreuters.com
   ```

2. Faça login com suas credenciais TR

3. Clique em **"Generate API Key"**

4. **IMPORTANTE:** 
   - Copie a chave imediatamente (só é mostrada uma vez)
   - Guarde em local seguro (1Password, etc)
   - Validade: **90 dias**
   - Budget: **$1000/mês** por usuário

### 2. Z-scaler Ativo

Certifique-se de que o **Z-scaler está ativo** na sua máquina TR. Sem ele, não conseguirá acessar o endpoint interno.

---

## 🚀 Teste 1: Script Standalone

### Configurar

```bash
# Adicione ao seu .bashrc ou .zshrc (compatível com Axiom Agents setup)
export ANTHROPIC_AUTH_TOKEN="sua-chave-aqui"
export ANTHROPIC_BASE_URL="https://litellm.int.thomsonreuters.com"
export ANTHROPIC_MODEL="anthropic/claude-sonnet-4-6"

# Recarregue o shell
source ~/.bashrc  # ou source ~/.zshrc
```

### Executar

```bash
# Método 1: Usando npm script (recomendado)
pnpm run test:litellm

# Método 2: Usando shell script diretamente (carrega .bashrc automaticamente)
./scripts/run-test.sh

# Método 3: Manual (certifique-se de que as variáveis estão exportadas)
pnpm tsx scripts/test-litellm.ts
```

### Saída Esperada

```
🧪 Testando LiteLLM Provider...

📋 Configuração:
   Base URL: https://litellm.int.thomsonreuters.com
   Model: anthropic/claude-sonnet-4-6
   API Key: sua-chave-...xyz4

📤 Enviando mensagem...

📥 Recebendo eventos:

A capital do Brasil é Brasília.

📊 [Usage]: { input: 25, output: 12, cache: 0 }
🏁 [Finish]: stop

✅ Teste concluído com sucesso!
📝 Total de tokens recebidos: 12
```

---

## 🧪 Teste 2: Integração com VSCode Extension

### 1. Configurar o VSCode

Edite `.vscode/settings.json` (ou User Settings):

```json
{
  "korix.provider": "litellm",
  "korix.litellm.model": "anthropic/claude-sonnet-4-6",
  "korix.litellm.apiBase": "https://litellm.int.thomsonreuters.com",
  "korix.maxTokens": 4096,
  "korix.temperature": 1.0
}
```

### 2. Armazenar API Key

A extensão vai pedir a API key na primeira execução e armazená-la de forma segura no VSCode Secret Storage.

Ou configure manualmente via Command Palette:

```
Ctrl+Shift+P → Korix: Set API Key
```

### 3. Testar

1. Pressione `F1` ou `Ctrl+Shift+P`
2. Digite: `Korix: Ask Claude`
3. Digite sua pergunta
4. Veja a resposta streaming em tempo real

---

## 🧪 Teste 3: Com Tool Calling

Modifique o `scripts/test-litellm.ts` para incluir tools:

```typescript
const stream = provider.send(
  {
    messages: [
      {
        role: "user",
        content: "Liste os arquivos na pasta src/core/providers",
      },
    ],
    tools: [
      {
        name: "list_files",
        description: "Lista arquivos em um diretório",
        input_schema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Caminho do diretório",
            },
          },
          required: ["path"],
        },
      },
    ],
    system: "Você é um assistente que pode listar arquivos.",
  },
  { correlationId: crypto.randomUUID(), sessionId: "test" },
);
```

**Saída esperada:**

```
🔧 [Tool Delta]: list_files {"path"
🔧 [Tool Delta]: list_files : "src/core/providers"}
✅ [Tool Complete]: list_files {"path":"src/core/providers"}
🏁 [Finish]: tool_calls
```

---

## 🧪 Teste 4: Circuit Breaker

Simule múltiplas falhas consecutivas para testar o circuit breaker:

```typescript
// Use uma API key inválida
const config: ProviderConfig = {
  type: "litellm",
  apiKey: "invalid-key-12345",
  model: "anthropic/claude-sonnet-4-6",
  baseUrl: "https://litellm.int.thomsonreuters.com",
};

// Tente 6 vezes
for (let i = 0; i < 6; i++) {
  try {
    await provider.send(...);
  } catch (error) {
    console.log(`Tentativa ${i + 1} falhou:`, error.message);
  }
}
```

**Saída esperada:**

```
Tentativa 1 falhou: Authentication failed
Tentativa 2 falhou: Authentication failed
Tentativa 3 falhou: Authentication failed
Tentativa 4 falhou: Authentication failed
Tentativa 5 falhou: Authentication failed
Tentativa 6 falhou: Circuit breaker open for https://litellm.int.thomsonreuters.com/v1/messages
```

---

## 🧪 Teste 5: Diferentes Modelos

### Claude Opus 4.7 (Mais inteligente)

```json
{
  "korix.litellm.model": "anthropic/claude-opus-4-7"
}
```

### GPT-4 Turbo

```json
{
  "korix.litellm.model": "openai/gpt-4-turbo"
}
```

### Gemini Pro

```json
{
  "korix.litellm.model": "gemini/gemini-pro"
}
```

---

## 🐛 Troubleshooting

### Erro: 403 Forbidden

**Causa:** Usando formato OpenAI ao invés de Anthropic Messages API, ou headers incorretos.

**Solução:**

```bash
# ❌ ERRADO: OpenAI format ou headers incorretos
curl -X POST https://litellm.int.thomsonreuters.com/v1/chat/completions \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -d '{"model":"anthropic/claude-sonnet-4-6","messages":[...]}'

# ✅ CORRETO: Anthropic Messages API com headers corretos
curl -X POST https://litellm.int.thomsonreuters.com/v1/messages \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "User-Agent: claude-cli/2.1.78 (external, sdk-cli)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role":"user","content":"Hello"}]
  }'
```

### Erro: "Circuit breaker open"

**Causa:** Muitas falhas consecutivas (5+).

**Solução:**
```typescript
// Aguarde 60 segundos para o circuit breaker resetar (OPEN → HALF_OPEN)
await new Promise(resolve => setTimeout(resolve, 60000));
```

### Erro: "Authentication failed" (401/403)

**Causa:** API key inválida, expirada, ou headers incorretos.

**Solução:**
1. Verifique se está usando `Authorization: Bearer` (não `x-api-key`)
2. Verifique se copiou a chave completa
3. Gere uma nova chave no Self-Service Portal
4. Verifique se a chave não expirou (90 dias)
5. Confirme que os headers `anthropic-version` e `User-Agent` estão presentes

### Erro: "Network timeout"

**Causa:** Z-scaler desativado ou sem VPN TR.

**Solução:**
1. Ative o Z-scaler
2. Conecte à VPN Thomson Reuters
3. Teste conectividade:
```bash
curl https://litellm.int.thomsonreuters.com/health
```

### Erro: "Budget exceeded"

**Causa:** Limite de $1000/mês atingido.

**Solução:**
1. Aguarde início do próximo mês
2. Ou entre em contato com o suporte LiteLLM via MS Teams

### Erro: "Invalid temperature for model"

**Causa:** Modelo O-series requer `temperature=1.0` (fixo).

**Solução:**
```json
{
  "korix.litellm.model": "openai/o-3",
  "korix.temperature": 1.0
}
```

---

## 📊 Monitoramento

### Dashboard LiteLLM TR

Acesse para ver uso, custos e logs:
```
https://litellm.int.thomsonreuters.com/ui
```

### Logs de Correlation

Todos os eventos incluem correlation IDs para rastreamento:

```typescript
{
  correlationId: "uuid-xxx",
  sessionId: "vscode-session-yyy",
  agentRunId: "run-zzz",
  iterationId: 3
}
```

Use esses IDs para encontrar requisições específicas no dashboard.

---

## 🆘 Suporte

**LiteLLM Support (Thomson Reuters):**
- MS Teams: **LiteLLM Support** channel
- Dashboard: https://litellm.int.thomsonreuters.com/ui
- Self-Service: https://litellm-self-service.8663.aws-int.thomsonreuters.com

**Korix Code Issues:**
- GitHub: https://github.com/your-org/korix-code-plugin/issues
