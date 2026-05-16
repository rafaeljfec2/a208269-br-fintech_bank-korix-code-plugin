/**
 * Provider registry for managing multiple LLM providers
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderFactory,
  ProviderType,
} from "./types";
import { AnthropicProvider } from "./anthropic";
import { LiteLLMFactory } from "../core/providers/litellm/litellmFactory";

class AnthropicFactory implements ProviderFactory {
  create(config: ProviderConfig): AIProvider {
    return new AnthropicProvider(config);
  }

  supports(type: ProviderType): boolean {
    return type === "anthropic";
  }
}

export class ProviderRegistry {
  private factories: Map<ProviderType, ProviderFactory> = new Map();
  private activeProvider: AIProvider | null = null;

  constructor() {
    this.registerFactory("anthropic", new AnthropicFactory());
    this.registerFactory("litellm", new LiteLLMFactory());
  }

  registerFactory(type: ProviderType, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  createProvider(config: ProviderConfig): AIProvider {
    const factory = this.factories.get(config.type);

    if (!factory) {
      throw new Error(
        `No factory registered for provider type: ${config.type}`,
      );
    }

    if (!factory.supports(config.type)) {
      throw new Error(`Factory does not support provider type: ${config.type}`);
    }

    const provider = factory.create(config);

    if (this.activeProvider) {
      void this.activeProvider.dispose();
    }

    this.activeProvider = provider;
    return provider;
  }

  getActiveProvider(): AIProvider | null {
    return this.activeProvider;
  }

  async dispose(): Promise<void> {
    if (this.activeProvider) {
      await this.activeProvider.dispose();
      this.activeProvider = null;
    }
  }

  supports(type: ProviderType): boolean {
    const factory = this.factories.get(type);
    return factory ? factory.supports(type) : false;
  }

  getSupportedProviders(): ProviderType[] {
    return Array.from(this.factories.keys());
  }
}

export const globalRegistry = new ProviderRegistry();
