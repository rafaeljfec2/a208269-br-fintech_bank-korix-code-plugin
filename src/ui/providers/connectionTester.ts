/**
 * ConnectionTester - Tests connection to provider
 * Extracted from MessageHandler to reduce file size
 */

import * as vscode from "vscode";
import type { Logger } from "../../telemetry/logger";
import type { RuntimeStateManager } from "../../core/runtime/runtimeStateManager";
import type { AgentLoopFactory } from "./agentLoopFactory";
import type {
  ExtensionToWebviewMessage,
  TestConnectionPayload,
} from "../../shared/protocol";

export class ConnectionTester {
  constructor(
    private readonly webview: vscode.Webview,
    private readonly logger: Logger,
    private readonly stateManager: RuntimeStateManager,
    private readonly agentLoopFactory: AgentLoopFactory,
  ) {}

  /**
   * Test connection to provider with given credentials
   */
  async testConnection(payload: TestConnectionPayload): Promise<void> {
    try {
      this.logger.info("Testing connection", { provider: payload.provider });

      // Create temporary config for testing
      const tempConfig = {
        type: payload.provider as
          | "anthropic"
          | "openai"
          | "ollama"
          | "openrouter"
          | "litellm",
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        model: "test-model", // Placeholder for connection test
      };

      // Create provider instance
      const provider = this.agentLoopFactory.createProvider(tempConfig);

      // Simple test: send a minimal message
      const testPrompt = "Hi";
      let responseReceived = false;

      const input = {
        messages: [
          { role: "user" as const, content: testPrompt, timestamp: Date.now() },
        ],
      };

      const context = {
        correlationId: crypto.randomUUID(),
        sessionId: this.stateManager.getSessionId() ?? crypto.randomUUID(),
      };

      const stream = provider.send(input, context);

      // Check if we get any response
      for await (const event of stream) {
        if (event.type === "token" || event.type === "thinking") {
          responseReceived = true;
          break; // Connection successful, stop streaming
        }
      }

      const message: ExtensionToWebviewMessage = {
        type: "connection_test_result",
        payload: {
          success: responseReceived,
          message: responseReceived
            ? "Connection successful!"
            : "No response received from provider",
        },
      };

      void this.webview.postMessage(message);
      this.logger.info("Connection test completed", {
        success: responseReceived,
      });
    } catch (error) {
      this.logger.error("Connection test failed", error);
      const message: ExtensionToWebviewMessage = {
        type: "connection_test_result",
        payload: {
          success: false,
          message:
            error instanceof Error ? error.message : "Connection test failed",
        },
      };
      void this.webview.postMessage(message);
    }
  }
}
