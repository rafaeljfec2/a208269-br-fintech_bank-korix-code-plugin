import type {
  AIProvider,
  ProviderConfig,
  ProviderFactory,
  ProviderType,
} from "../../../providers/types";
import { OpenAIProvider } from "./openaiProvider";
import { TransportBuilder } from "../transport";
import { ConfigValidationError } from "../litellm/litellmErrors";

export class OpenAIFactory implements ProviderFactory {
  constructor(
    private readonly logger?: {
      info: (message: string, context?: Record<string, unknown>) => void;
      warn: (message: string, context?: Record<string, unknown>) => void;
    },
  ) {}

  create(config: ProviderConfig): AIProvider {
    this.validateConfig(config);

    const transportBuilder = new TransportBuilder();

    if (config.apiKey) {
      transportBuilder.withAuth({
        header: "Authorization",
        token: config.apiKey,
      });
    }

    const transport = transportBuilder
      .withTimeout(120000)
      .withRetry({
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      }, this.logger)
      .withCircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        openDuration: 60000,
        halfOpenMaxRequests: 1,
      }, this.logger)
      .withTracing()
      .withMetrics((metric) => {
        this.logger?.info("OpenAI request metric", {
          url: metric.url,
          method: metric.method,
          status: metric.status,
          duration: metric.duration,
          success: metric.success,
        });
      })
      .build();

    // Type assertion is needed due to the dual type hierarchies that will be unified in a future refactor
    return new OpenAIProvider(config, transport) as unknown as AIProvider;
  }

  supports(type: ProviderType): boolean {
    return type === "openai";
  }

  private validateConfig(config: ProviderConfig): void {
    const baseUrl = config.baseUrl ?? "https://api.openai.com";

    if (baseUrl.endsWith("/")) {
      throw new ConfigValidationError("baseUrl must not have trailing slash");
    }

    if (!config.model) {
      throw new ConfigValidationError("model is required");
    }

    const isLocal =
      baseUrl.includes("localhost") ||
      baseUrl.includes("127.0.0.1") ||
      baseUrl.includes("0.0.0.0");

    if (!config.apiKey && !isLocal) {
      throw new ConfigValidationError("apiKey is required for non-local OpenAI requests");
    }
  }
}
