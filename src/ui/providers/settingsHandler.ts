/**
 * SettingsHandler - Handles loading and saving provider settings
 * Extracted from MessageHandler to reduce file size
 */

import * as vscode from "vscode";
import type { Logger } from "../../telemetry/logger";
import type { ProviderConfigManager } from "../../providers/config";
import type {
  ExtensionToWebviewMessage,
  SaveSettingsPayload,
} from "../../shared/protocol";

export class SettingsHandler {
  constructor(
    private readonly webview: vscode.Webview,
    private readonly logger: Logger,
    private readonly configManager: ProviderConfigManager,
  ) {}

  /**
   * Load current settings and send to webview
   */
  async loadSettings(): Promise<void> {
    try {
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      const config = await this.configManager.getConfig(providerType);
      const maxTokens = vscode.workspace
        .getConfiguration("korix")
        .get<number>("maxTokens", 4096);
      const temperature = vscode.workspace
        .getConfiguration("korix")
        .get<number>("temperature", 0.7);

      // Check if API key exists (don't send the key itself)
      const hasApiKey = !!(await this.configManager.getApiKey(providerType));

      const message: ExtensionToWebviewMessage = {
        type: "settings_loaded",
        payload: {
          provider: providerType,
          model: config?.model ?? "claude-sonnet-4-6",
          baseUrl: config?.baseUrl,
          maxTokens,
          temperature,
          hasApiKey,
        },
      };

      void this.webview.postMessage(message);
      this.logger.info("Settings loaded and sent to webview");
    } catch (error) {
      this.logger.error("Failed to load settings", error);
    }
  }

  /**
   * Save settings to workspace config and secrets
   */
  async saveSettings(payload: SaveSettingsPayload): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration("korix");

      // Determinar target: Workspace se aberto, senão Global
      const configTarget = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

      // Save provider selection
      await config.update("provider", payload.provider, configTarget);

      // Save API key to secrets (if provided)
      if (payload.apiKey) {
        await this.configManager.setApiKey(payload.provider, payload.apiKey);
      }

      // Save model
      if (payload.model) {
        await config.update(
          `${payload.provider}.model`,
          payload.model,
          configTarget,
        );
      }

      // Save baseUrl (if provided)
      if (payload.baseUrl !== undefined) {
        await config.update(
          `${payload.provider}.baseUrl`,
          payload.baseUrl,
          configTarget,
        );
      }

      // Save advanced settings
      if (payload.maxTokens !== undefined) {
        await config.update("maxTokens", payload.maxTokens, configTarget);
      }

      if (payload.temperature !== undefined) {
        await config.update("temperature", payload.temperature, configTarget);
      }

      // Notify success
      const message: ExtensionToWebviewMessage = {
        type: "settings_saved",
        payload: { success: true, message: "Settings saved successfully" },
      };

      void this.webview.postMessage(message);
      this.logger.info("Settings saved successfully", {
        provider: payload.provider,
      });
    } catch (error) {
      this.logger.error("Failed to save settings", error);
      const message: ExtensionToWebviewMessage = {
        type: "settings_saved",
        payload: {
          success: false,
          message:
            error instanceof Error ? error.message : "Failed to save settings",
        },
      };
      void this.webview.postMessage(message);
    }
  }
}
