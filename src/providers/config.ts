/**
 * Provider configuration management with secure API key storage
 */

import * as vscode from "vscode";
import type { ProviderConfig, ProviderType } from "./types";

const API_KEY_PREFIX = "korix.apiKey";

export class ProviderConfigManager {
  constructor(private context: vscode.ExtensionContext) {}

  async getConfig(type: ProviderType): Promise<ProviderConfig | null> {
    const config = vscode.workspace.getConfiguration("korix");
    const providerType = config.get<ProviderType>("provider", "anthropic");

    if (providerType !== type) {
      return null;
    }

    const apiKey = await this.getApiKey(type);
    if (!apiKey) {
      return null;
    }

    const model = this.getModel(type);
    const baseUrl = this.getBaseUrl(type);
    const maxTokens = config.get<number>("maxTokens");
    const temperature = config.get<number>("temperature");

    return {
      type,
      apiKey,
      model,
      baseUrl,
      maxTokens,
      temperature,
    };
  }

  async setApiKey(type: ProviderType, apiKey: string): Promise<void> {
    const key = `${API_KEY_PREFIX}.${type}`;
    await this.context.secrets.store(key, apiKey);
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
      default:
        return undefined;
    }
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
