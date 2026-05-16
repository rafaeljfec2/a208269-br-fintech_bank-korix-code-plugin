/**
 * LiteLLM Provider Factory
 */

import type { AIProvider, ProviderConfig, ProviderFactory, ProviderType } from "../../../providers/types";
import { LiteLLMProvider } from "./litellmProvider";
import { TransportBuilder } from "../transport";
import { DEFAULT_LITELLM_CONFIG } from "./litellmTypes";
import { ConfigValidationError } from "./litellmErrors";

/**
 * LiteLLM Provider Factory
 * Cria LiteLLM provider com transport chain completo
 */
export class LiteLLMFactory implements ProviderFactory {
  constructor(
    private readonly logger?: {
      info: (message: string, context?: Record<string, unknown>) => void;
      warn: (message: string, context?: Record<string, unknown>) => void;
    },
  ) {}

  create(config: ProviderConfig): AIProvider {
    // Validate config
    this.validateConfig(config);

    // Build transport chain
    const transport = new TransportBuilder()
      .withAuth({
        header: "Authorization",  // LiteLLM TR requer Bearer auth (não x-api-key)
        token: config.apiKey,
      })
      .withTimeout(DEFAULT_LITELLM_CONFIG.timeoutMs ?? 120000)
      .withRetry(DEFAULT_LITELLM_CONFIG.retryPolicy ?? {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      }, this.logger)
      .withCircuitBreaker(DEFAULT_LITELLM_CONFIG.circuitBreakerPolicy ?? {
        failureThreshold: 5,
        successThreshold: 2,
        openDuration: 60000,
        halfOpenMaxRequests: 1,
      }, this.logger)
      .withTracing()
      .withMetrics((metric) => {
        this.logger?.info("LiteLLM request metric", {
          url: metric.url,
          method: metric.method,
          status: metric.status,
          duration: metric.duration,
          success: metric.success,
        });
      })
      .build();

    // FIXME: Type assertion necessária porque há duas hierarquias de tipos (src/providers/types vs src/core/providers/types)
    // Isso deve ser unificado em refatoração futura
    return new LiteLLMProvider(config, transport) as unknown as AIProvider;
  }

  supports(type: ProviderType): boolean {
    return type === "litellm";
  }

  private validateConfig(config: ProviderConfig): void {
    const baseUrl = config.baseUrl ?? DEFAULT_LITELLM_CONFIG.apiBase ?? "";

    // 0. Required field
    if (!baseUrl) {
      throw new ConfigValidationError("apiBase is required");
    }

    // 1. No trailing slash
    if (baseUrl.endsWith("/")) {
      throw new ConfigValidationError("apiBase must not have trailing slash");
    }

    // 2. Vendor prefix
    if (!config.model.includes("/")) {
      throw new ConfigValidationError(
        `model must include vendor prefix (e.g., anthropic/claude-opus-4-7). Got: ${config.model}`,
      );
    }

    // 3. Valid vendor
    const parts = config.model.split("/");
    const vendor = parts[0] ?? "";
    const validVendors = ["anthropic", "openai", "gemini"];
    if (!validVendors.includes(vendor)) {
      throw new ConfigValidationError(
        `Unknown vendor: ${vendor}. Valid vendors: ${validVendors.join(", ")}`,
      );
    }
  }
}
