import * as vscode from "vscode";
import type { Mode } from "./core/types";
import { globalRegistry } from "./providers/registry";
import { ProviderConfigManager } from "./providers/config";
import type { AIProvider } from "./providers/types";
import { KorixSidebarProvider } from "./ui/sidebar/sidebarProvider";
import { TimelineProvider } from "./ui/timeline/timelineProvider";
import type { Logger } from "./telemetry/logger";
import type { ContextEngine } from "./context/contextEngine";
import type { TerminalSessionManager } from "./terminal/session";
import { registerAllTools } from "./tools";
import { createContainer, setGlobalContainer, getGlobalContainer } from "./di/container";
import { configureContainer } from "./di/bindings";
import { TOKENS } from "./di/tokens";

let outputChannel: vscode.OutputChannel;
let currentMode: Mode = "ask";
let statusBarItem: vscode.StatusBarItem;
let configManager: ProviderConfigManager;
let activeProvider: AIProvider | null = null;
let sidebarProvider: KorixSidebarProvider;
let timelineProvider: TimelineProvider;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Korix Code");

  // Create and configure DI container
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const container = createContainer();
  configureContainer(container, context, workspaceRoot);
  setGlobalContainer(container);

  // Resolve services from container
  const logger = container.get<Logger>(TOKENS.Logger);
  const contextEngine = container.get<ContextEngine>(TOKENS.ContextEngine);

  logger.info("Korix Code extension is now active");
  logger.info("Korix Code initialized");

  configManager = new ProviderConfigManager(context);

  void initializeProvider();

  // Initialize Context Engine
  void contextEngine.initialize().then(() => {
    logger.info("Context Engine ready");
  });

  logger.info("DI Container initialized");

  // Register all tools
  registerAllTools();

  // Register UI providers
  sidebarProvider = new KorixSidebarProvider(context.extensionUri);
  timelineProvider = new TimelineProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      KorixSidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "korix.timelineView",
      timelineProvider,
    ),
  );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "korix.openSidebar";
  updateStatusBar();
  statusBarItem.show();

  const commands = [
    vscode.commands.registerCommand("korix.ask", () => {
      handleModeSwitch("ask");
    }),

    vscode.commands.registerCommand("korix.plan", () => {
      handleModeSwitch("plan");
    }),

    vscode.commands.registerCommand("korix.agent", () => {
      handleModeSwitch("agent");
    }),

    vscode.commands.registerCommand("korix.openSidebar", () => {
      vscode.window.showInformationMessage(
        `Korix Code Sidebar (Coming Soon) - Current Mode: ${currentMode}`,
      );
      logger.info("Sidebar opened");
    }),

    vscode.commands.registerCommand("korix.cancelExecution", () => {
      vscode.window.showInformationMessage("Execution cancelled");
      logger.info("Execution cancelled by user");
    }),

    vscode.commands.registerCommand("korix.clearHistory", () => {
      vscode.window.showInformationMessage("History cleared");
      logger.info("History cleared");
    }),

    vscode.commands.registerCommand("korix.testProvider", async () => {
      await testProviderStreaming();
    }),
  ];

  context.subscriptions.push(...commands, outputChannel, statusBarItem);

  logger.info("Commands registered", { count: commands.length });
  logger.info("Current mode", { mode: currentMode });
  logger.info("Extension activation complete");
}

export async function deactivate() {
  try {
    const container = getGlobalContainer();
    const logger = container.get<Logger>(TOKENS.Logger);
    logger.info("Korix Code extension is now deactivated");

    if (outputChannel) {
      logger.info("Korix Code deactivating...");
    }

    if (activeProvider) {
      await activeProvider.dispose();
    }

    await globalRegistry.dispose();

    // Dispose Context Engine
    try {
      const contextEngine = container.get<ContextEngine>(TOKENS.ContextEngine);
      contextEngine.dispose();
    } catch {
      // Context engine may not be initialized
    }

    // Dispose Terminal System
    try {
      const sessionManager = container.get<TerminalSessionManager>(TOKENS.SessionManager);
      sessionManager.dispose();
    } catch {
      // Session manager may not be initialized
    }
  } catch {
    // Container may not be initialized
  }

  if (outputChannel) {
    outputChannel.dispose();
  }

  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

function handleModeSwitch(mode: Mode) {
  const logger = getGlobalContainer().get<Logger>(TOKENS.Logger);
  currentMode = mode;
  updateStatusBar();

  const modeDescriptions: Record<Mode, string> = {
    ask: "Ask Mode - Read-only analysis and explanations",
    plan: "Plan Mode - Task decomposition and planning",
    agent: "Agent Mode - Full execution with tool access",
  };

  const modeIcons: Record<Mode, string> = {
    ask: "$(comment-discussion)",
    plan: "$(list-tree)",
    agent: "$(robot)",
  };

  vscode.window.showInformationMessage(
    `${modeIcons[mode]} Switched to ${modeDescriptions[mode]}`,
  );

  logger.info("Mode switched", { mode, description: modeDescriptions[mode] });
}

async function initializeProvider() {
  const logger = getGlobalContainer().get<Logger>(TOKENS.Logger);
  try {
    const config = await configManager.getConfig("anthropic");
    if (config) {
      activeProvider = globalRegistry.createProvider(config);
      logger.info("Provider initialized", {
        type: config.type,
        model: config.model,
      });
    } else {
      logger.info(
        "No provider configured. Will prompt for API key when needed.",
      );
    }
  } catch (error) {
    const err = error as Error;
    logger.error("Failed to initialize provider", err);
  }
}

async function testProviderStreaming() {
  const logger = getGlobalContainer().get<Logger>(TOKENS.Logger);
  try {
    if (!activeProvider) {
      await configManager.ensureApiKey("anthropic");
      const config = await configManager.getConfig("anthropic");
      if (!config) {
        throw new Error("Failed to get provider config");
      }
      activeProvider = globalRegistry.createProvider(config);
    }

    logger.info("Testing Provider Streaming");
    outputChannel.show();

    const stream = activeProvider.send({
      messages: [
        {
          role: "user",
          content: 'Say "Hello from Korix!"',
          timestamp: Date.now(),
        },
      ],
      maxTokens: 100,
    });

    let textContent = "";
    for await (const chunk of stream) {
      if (chunk.type === "text") {
        textContent += chunk.content;
        outputChannel.append(chunk.content);
      } else if (chunk.type === "done") {
        logger.info("Stream completed", {
          stopReason: chunk.stopReason ?? "unknown",
          usage: chunk.usage,
        });
      } else if (chunk.type === "error") {
        logger.error("Stream error", new Error(chunk.error));
      }
    }

    vscode.window.showInformationMessage("Provider streaming test completed!");
  } catch (error) {
    const err = error as Error;
    logger.error("Provider test failed", err);
    vscode.window.showErrorMessage(`Provider test failed: ${err.message}`);
  }
}

function updateStatusBar() {
  const modeEmojis: Record<Mode, string> = {
    ask: "🔍",
    plan: "📋",
    agent: "⚙️",
  };

  statusBarItem.text = `${modeEmojis[currentMode]} Korix (${currentMode.toUpperCase()})`;
  statusBarItem.tooltip = `Korix Code - ${currentMode} mode\nClick to open sidebar`;
}
