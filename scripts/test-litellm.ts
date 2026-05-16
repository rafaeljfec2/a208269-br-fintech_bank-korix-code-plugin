/**
 * Script de teste manual do LiteLLM Provider
 * Execute: pnpm tsx scripts/test-litellm.ts
 * Ou: pnpm run test:litellm
 */

import { LiteLLMProvider } from "../src/core/providers/litellm/litellmProvider";
import { TransportBuilder } from "../src/core/providers/transport";
import type { ProviderConfig } from "../src/providers/types";

async function testLiteLLM() {
  console.log("🧪 Testando LiteLLM Provider...\n");

  // 1. Pega as variáveis do .bashrc (compatível com setup TR)
  const API_KEY =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.LITELLM_API_KEY ||
    "";

  const BASE_URL =
    process.env.ANTHROPIC_BASE_URL ||
    "https://litellm.int.thomsonreuters.com";

  const MODEL =
    process.env.ANTHROPIC_MODEL ||
    "anthropic/claude-sonnet-4-6";

  if (!API_KEY) {
    console.error("❌ API key não encontrada!");
    console.log("   Configure no .bashrc:");
    console.log("   export ANTHROPIC_AUTH_TOKEN=sua-chave");
    console.log("   ou");
    console.log("   export LITELLM_API_KEY=sua-chave");
    process.exit(1);
  }

  console.log("📋 Configuração:");
  console.log("   Base URL:", BASE_URL);
  console.log("   Model:", MODEL);
  console.log("   API Key:", API_KEY.substring(0, 10) + "..." + API_KEY.slice(-4));
  console.log("");

  // 2. Build transport chain
  const transport = new TransportBuilder()
    .withAuth({
      header: "Authorization",  // LiteLLM TR requer Authorization: Bearer
      token: API_KEY,
    })
    .withTimeout(120000)
    .withRetry(
      {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      },
      {
        warn: (msg, ctx) => console.warn("⚠️ ", msg, ctx),
      },
    )
    .withTracing()
    .withMetrics((metric) => {
      console.log("📊 Metric:", {
        url: metric.url,
        method: metric.method,
        status: metric.status,
        duration: `${metric.duration}ms`,
        success: metric.success,
      });
    })
    .build();

  // 3. Create provider
  const config: ProviderConfig = {
    type: "litellm",
    apiKey: API_KEY,
    model: MODEL,
    baseUrl: BASE_URL,
    maxTokens: 1024,
    temperature: 1.0,
  };

  const provider = new LiteLLMProvider(config, transport);

  try {
    console.log("📤 Enviando mensagem...");
    console.log("");

    // 4. Send request
    const stream = provider.send(
      {
        messages: [
          {
            role: "user",
            content: "Olá! Você pode me dizer qual é a capital do Brasil?",
            timestamp: Date.now(),
          },
        ],
        system: "Você é um assistente útil.",
        maxTokens: 200,
      },
      {
        correlationId: crypto.randomUUID(),
        sessionId: "test-session",
        agentRunId: "test-run",
        iterationId: 1,
      },
    );

    // 5. Process events
    console.log("📥 Recebendo eventos:\n");
    let tokenCount = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "token":
          process.stdout.write(event.value);
          tokenCount++;
          break;

        case "thinking":
          console.log("\n💭 [Thinking]:", event.value);
          break;

        case "tool_call_delta":
          console.log(
            "\n🔧 [Tool Delta]:",
            event.name,
            event.argumentsChunk?.substring(0, 50),
          );
          break;

        case "tool_call_complete":
          console.log("\n✅ [Tool Complete]:", event.name, event.arguments);
          break;

        case "usage":
          console.log("\n\n📊 [Usage]:", {
            input: event.inputTokens,
            output: event.outputTokens,
            cache: event.cacheReadTokens,
          });
          break;

        case "finish":
          console.log("\n🏁 [Finish]:", event.reason);
          break;

        case "error":
          console.error("\n❌ [Error]:", event.error.message);
          break;
      }
    }

    console.log("\n\n✅ Teste concluído com sucesso!");
    console.log(`📝 Total de tokens recebidos: ${tokenCount}`);
  } catch (error) {
    console.error("\n❌ Erro durante o teste:");
    if (error instanceof Error) {
      console.error("   Mensagem:", error.message);
      console.error("   Stack:", error.stack);
    } else {
      console.error("   Erro desconhecido:", error);
    }
    process.exit(1);
  } finally {
    await provider.dispose();
  }
}

// Execute
testLiteLLM().catch((error) => {
  console.error("❌ Erro fatal:", error);
  process.exit(1);
});
