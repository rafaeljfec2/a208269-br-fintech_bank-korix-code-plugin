/**
 * AgentExecutor - Handles agent loop execution
 * Extracted from MessageHandler to reduce file size
 */

import * as vscode from "vscode";
import type { Logger } from "../../telemetry/logger";
import type { RuntimeStateManager } from "../../core/runtime/runtimeStateManager";
import type { ProviderConfigManager } from "../../providers/config";
import type { AgentLoopFactory } from "./agentLoopFactory";
import { PluginContextBuilder } from "../../prompts/pluginContext";
import type { ToolRegistry } from "../../harness/toolRegistry";

export class AgentExecutor {
  constructor(
    private readonly logger: Logger,
    private readonly stateManager: RuntimeStateManager,
    private readonly configManager: ProviderConfigManager,
    private readonly agentLoopFactory: AgentLoopFactory,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  /**
   * Execute agent loop with user message and history
   */
  async execute(
    content: string,
    previousMessages: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
  ): Promise<void> {
    this.logger.info("User message received", {
      length: content.length,
      historyLength: previousMessages.length,
      lastHistoryRole: previousMessages[previousMessages.length - 1]?.role,
    });

    try {
      // Get provider config
      const providerType = vscode.workspace
        .getConfiguration("korix")
        .get<
          "anthropic" | "openai" | "ollama" | "openrouter" | "litellm"
        >("provider", "anthropic");

      const providerConfig = await this.configManager.getConfig(providerType);
      if (!providerConfig) {
        vscode.window.showErrorMessage(
          `Provider ${providerType} not configured. Please set API key.`,
        );
        return;
      }

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(providerConfig);

      // Get mode (use default if not initialized yet)
      const mode = this.stateManager.isInitialized()
        ? this.stateManager.getMode()
        : "ask";

      // Build unified system prompt
      const contextBuilder = new PluginContextBuilder(
        this.toolRegistry,
        this.logger,
      );

      const systemPrompt = contextBuilder.build({
        mode,
        providerType: providerType,
        model: providerConfig.model,
        maxIterations: 25,
      });

      // Create AgentLoop with system prompt
      const agentLoop = this.agentLoopFactory.createAgentLoop(
        provider,
        systemPrompt,
      );

      // Prepare execution context
      const context = {
        mode,
        workspaceRoot:
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        openFiles: [],
      };

      // Initialize RuntimeStateManager if needed
      if (!this.stateManager.isInitialized()) {
        this.stateManager.initialize(context);
      }

      // Mark as executing
      this.stateManager.startExecution();

      // Run agent loop with history and process events
      const generator = agentLoop.run(content, context, previousMessages);

      try {
        for await (const event of generator) {
          try {
            this.logger.debug("Runtime event", { type: event.type });
            // Events are auto-forwarded via RuntimeEventEmitter subscription
          } catch (eventError) {
            this.logger.error("Failed to process runtime event", eventError);
            // Continue iteration - don't let event processing errors stop the loop
          }
        }

        this.logger.info("Agent loop completed successfully");
      } catch (error) {
        this.logger.error("Agent loop failed", error);
        vscode.window.showErrorMessage(
          `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.stateManager.stopExecution();
      }
    } catch (error) {
      this.logger.error("Failed to initialize agent loop", error);
      this.stateManager.stopExecution();
      vscode.window.showErrorMessage(
        `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
