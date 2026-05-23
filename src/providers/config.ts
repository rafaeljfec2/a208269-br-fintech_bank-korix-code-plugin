/**
 * Provider configuration management with secure API key storage
 */

import * as vscode from "vscode";
import type { ProviderConfig, ProviderType } from "./types";

const API_KEY_PREFIX = "korix.apiKey";
const DEFAULT_LITELLM_BASE_URL = "https://litellm.int.thomsonreuters.com";
const LITELLM_NON_CHAT_MODEL_PARTS = [
  "/low/",
  "/medium/",
  "/high/",
  "/standard/",
  "/hd/",
  "256-x-",
  "512-x-",
  "1024-x-",
  "1536-x-",
  "1792-x-",
  "audio",
  "babbage",
  "container",
  "dall-e",
  "davinci",
  "embedding",
  "ft:",
  "gpt-image",
  "image",
  "instruct",
  "moderation",
  "realtime",
  "search",
  "sora",
  "transcribe",
  "tts",
  "whisper",
] as const;

interface LiteLLMModelsResponse {
  readonly data?: readonly unknown[];
}

export class ProviderConfigManager {
  private readonly configCache = new Map<ProviderType, ProviderConfig | null>();

  constructor(private context: vscode.ExtensionContext) {
    const workspaceEvents = vscode.workspace as typeof vscode.workspace & {
      readonly onDidChangeConfiguration?:
        typeof vscode.workspace.onDidChangeConfiguration;
    };
    const disposable = workspaceEvents.onDidChangeConfiguration?.((event) => {
      if (event.affectsConfiguration("korix")) {
        this.invalidateCache();
      }
    });

    if (disposable) {
      this.context.subscriptions.push(disposable);
    }
  }

  async getConfig(type: ProviderType): Promise<ProviderConfig | null> {
    const cached = this.configCache.get(type);
    if (cached !== undefined) {
      return cached;
    }

    const config = vscode.workspace.getConfiguration("korix");
    const providerType = config.get<ProviderType>("provider", "anthropic");

    if (providerType !== type) {
      this.configCache.set(type, null);
      return null;
    }

    const apiKey = await this.getApiKey(type);
    if (!apiKey) {
      this.configCache.set(type, null);
      return null;
    }

    const model = this.getModel(type);
    const baseUrl = this.getBaseUrl(type);
    const maxTokens = config.get<number>("maxTokens");
    const temperature = config.get<number>("temperature");

    const providerConfig = {
      type,
      apiKey,
      model,
      baseUrl,
      maxTokens,
      temperature,
    };
    this.configCache.set(type, providerConfig);

    return providerConfig;
  }

  getConfiguredModel(type: ProviderType): string {
    return this.getModel(type);
  }

  async setApiKey(type: ProviderType, apiKey: string): Promise<void> {
    const key = `${API_KEY_PREFIX}.${type}`;
    await this.context.secrets.store(key, apiKey);
    this.invalidateCache(type);
  }

  async getApiKey(type: ProviderType): Promise<string | undefined> {
    const key = `${API_KEY_PREFIX}.${type}`;
    const stored = await this.context.secrets.get(key);

    if (stored) {
      return stored;
    }

    const config = vscode.workspace.getConfiguration("korix");
    const configKey = config.get<string>(`${type}.apiKey`);

    if (configKey) {
      await this.setApiKey(type, configKey);
      return configKey;
    }

    return undefined;
  }

  async deleteApiKey(type: ProviderType): Promise<void> {
    const key = `${API_KEY_PREFIX}.${type}`;
    await this.context.secrets.delete(key);
    this.invalidateCache(type);
  }

  async listLiteLLMModels(): Promise<readonly string[]> {
    const apiKey = await this.getApiKey("litellm");
    if (!apiKey) {
      return [];
    }

    try {
      const baseUrl = this.normalizeBaseUrl(
        this.getBaseUrl("litellm") ?? DEFAULT_LITELLM_BASE_URL,
      );
      const response = await fetch(
        `${baseUrl}/models?return_wildcard_routes=false`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-litellm-api-key": apiKey,
          },
        },
      );

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as LiteLLMModelsResponse;
      const models =
        payload.data
          ?.map((item) => this.extractLiteLLMModelId(item))
          .filter((item): item is string => item !== undefined)
          .filter((modelId) => this.isSelectableLiteLLMModel(modelId)) ?? [];

      return [...new Set(models)].sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  invalidateCache(type?: ProviderType): void {
    if (type) {
      this.configCache.delete(type);
      return;
    }

    this.configCache.clear();
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  private getModel(type: ProviderType): string {
    const config = vscode.workspace.getConfiguration("korix");

    switch (type) {
      case "anthropic":
        return config.get<string>("anthropic.model", "claude-sonnet-4-6");
      case "openai":
        return config.get<string>("openai.model", "gpt-4-turbo");
      case "ollama":
        return config.get<string>("ollama.model", "llama2");
      case "openrouter":
        return config.get<string>(
          "openrouter.model",
          "anthropic/claude-sonnet-4",
        );
      case "litellm":
        return config.get<string>("litellm.model", "anthropic/claude-opus-4-7");
      default:
        return "claude-sonnet-4-6";
    }
  }

  private getBaseUrl(type: ProviderType): string | undefined {
    const config = vscode.workspace.getConfiguration("korix");

    switch (type) {
      case "anthropic":
        return config.get<string>("anthropic.baseUrl");
      case "openai":
        return config.get<string>("openai.baseUrl");
      case "ollama":
        return config.get<string>("ollama.baseUrl", "http://localhost:11434");
      case "openrouter":
        return config.get<string>(
          "openrouter.baseUrl",
          "https://openrouter.ai/api/v1",
        );
      case "litellm":
        return config.get<string>("litellm.baseUrl", DEFAULT_LITELLM_BASE_URL);
      default:
        return undefined;
    }
  }

  private extractLiteLLMModelId(value: unknown): string | undefined {
    if (typeof value === "string") {
      return value.trim().length > 0 ? value.trim() : undefined;
    }

    if (typeof value !== "object" || value === null) {
      return undefined;
    }

    const record = value as Readonly<Record<string, unknown>>;
    const candidate = record.id ?? record.model_name ?? record.model;

    return typeof candidate === "string" && candidate.trim().length > 0
      ? candidate.trim()
      : undefined;
  }

  private isSelectableLiteLLMModel(modelId: string): boolean {
    const normalized = modelId.trim().toLowerCase();

    if (
      normalized.length === 0 ||
      normalized.includes("*") ||
      normalized === "all-proxy-models"
    ) {
      return false;
    }

    if (LITELLM_NON_CHAT_MODEL_PARTS.some((part) => normalized.includes(part))) {
      return false;
    }

    return (
      normalized.startsWith("anthropic/") ||
      normalized.startsWith("claude-") ||
      normalized.startsWith("us.anthropic.") ||
      normalized.startsWith("openai/gpt-") ||
      normalized.startsWith("openai/o") ||
      normalized.startsWith("gemini/") ||
      normalized.startsWith("vertex_ai/claude-") ||
      normalized.startsWith("vertex_ai/gemini-") ||
      normalized.startsWith("vertex_ai/deepseek-ai/") ||
      normalized.startsWith("vertex_ai/minimaxai/") ||
      normalized.startsWith("vertex_ai/moonshotai/") ||
      normalized.startsWith("vertex_ai/zai-org/")
    );
  }

  async promptForApiKey(type: ProviderType): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter your ${type} API key`,
      password: true,
      placeHolder: "sk-...",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "API key cannot be empty";
        }
        return null;
      },
    });

    if (apiKey) {
      await this.setApiKey(type, apiKey);
    }

    return apiKey;
  }

  async ensureApiKey(type: ProviderType): Promise<string> {
    let apiKey = await this.getApiKey(type);

    if (!apiKey) {
      apiKey = await this.promptForApiKey(type);
      if (!apiKey) {
        throw new Error(`API key required for ${type} provider`);
      }
    }

    return apiKey;
  }
}
