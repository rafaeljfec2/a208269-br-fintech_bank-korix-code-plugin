/**
 * DI Bindings configuration
 */

import * as vscode from "vscode";
import path from "node:path";
import type { Container } from "./container";
import { TOKENS } from "./tokens";
import { initializeLogger, type Logger } from "../telemetry/logger";
import { WorkspaceIndexer } from "../context/indexing/workspaceIndexer";
import { HeuristicRanker } from "../context/ranking/heuristicRanker";
import { ContextBuilder } from "../context/retrieval/contextBuilder";
import { ContextEngine } from "../context/contextEngine";
import {
  ContextQualityTelemetryBuffer,
  isNodeSQLiteRuntimeAvailable,
} from "@korix/context-compiler";
import { TerminalSessionManager } from "../terminal/session";
import { CommandRunner } from "../terminal/commandRunner";
import { PatchParser } from "../patch/parser";
import { PatchValidator } from "../patch/validation";
import { RollbackManager } from "../patch/rollback";
import { PatchApplier } from "../patch/applier";
import { globalToolRegistry } from "../harness/toolRegistry";
import {
  PermissionManager,
  type ApprovalRequest,
  type ApprovalResponse,
} from "../harness/permissions";
import { ProviderRegistry } from "../providers/registry";
import { ProviderConfigManager } from "../providers/config";
import { RuntimeEventEmitter } from "../core/runtime/runtimeEvents";
import { askUserQuestion } from "../core/runtime/userQuestion";
import { RuntimeMetrics } from "../core/runtime/runtimeMetrics";
import { RuntimeStateManager } from "../core/runtime/runtimeStateManager";
import { CheckpointManager } from "../core/runtime/checkpoints";
import { RecoveryManager } from "../core/runtime/recovery";
import { IterationGuard } from "../core/runtime/iterationGuard";
import { CancellationManager } from "../core/runtime/cancellation";
import { TaskQueue } from "../core/runtime/taskQueue";
// ExecutionEngine and AgentLoop created on-demand, not pre-bound

export function configureContainer(
  container: Container,
  context: vscode.ExtensionContext,
  workspaceRoot: string | undefined,
): void {
  // Configuration values
  container.bindValue(TOKENS.ExtensionContext, context);
  container.bindValue(TOKENS.WorkspaceRoot, workspaceRoot ?? process.cwd());

  // Logger (singleton)
  container.bindSingleton(TOKENS.Logger, () => {
    const outputChannel = vscode.window.createOutputChannel("Korix Code");
    return initializeLogger({ outputChannel });
  });

  // Tool Registry (use existing global)
  container.bindValue(TOKENS.ToolRegistry, globalToolRegistry);

  // Permission Manager (singleton)
  container.bindSingleton(TOKENS.PermissionManager, (c) => {
    const eventEmitter = c.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    return new PermissionManager((request) =>
      requestPermissionInWebview(eventEmitter, request),
    );
  });

  // Provider Registry (singleton)
  container.bindSingleton(
    TOKENS.ProviderRegistry,
    () => new ProviderRegistry(),
  );

  // Provider Config Manager (singleton)
  container.bindSingleton(TOKENS.ProviderConfigManager, (c) => {
    const ctx = c.get<vscode.ExtensionContext>(TOKENS.ExtensionContext);
    return new ProviderConfigManager(ctx);
  });

  // Context services (singletons)
  container.bindSingleton(
    TOKENS.WorkspaceIndexer,
    () => new WorkspaceIndexer(),
  );

  container.bindSingleton(TOKENS.HeuristicRanker, (c) => {
    const indexer = c.get<WorkspaceIndexer>(TOKENS.WorkspaceIndexer);
    return new HeuristicRanker(indexer);
  });

  container.bindSingleton(TOKENS.ContextBuilder, (c) => {
    const indexer = c.get<WorkspaceIndexer>(TOKENS.WorkspaceIndexer);
    const ranker = c.get<HeuristicRanker>(TOKENS.HeuristicRanker);
    return new ContextBuilder(indexer, ranker);
  });

  container.bindSingleton(TOKENS.ContextEngine, (c) => {
    const ctx = c.get<vscode.ExtensionContext>(TOKENS.ExtensionContext);
    if (!isNodeSQLiteRuntimeAvailable()) {
      return new ContextEngine(undefined, {}, workspaceRoot);
    }

    return new ContextEngine(
      undefined,
      {
        cacheDatabasePath: path.join(
          ctx.globalStorageUri.fsPath,
          "context-compiler-cache.sqlite",
        ),
      },
      workspaceRoot,
    );
  });

  container.bindSingleton(
    TOKENS.ContextQualityTelemetryBuffer,
    () => new ContextQualityTelemetryBuffer(),
  );

  // Terminal services (singletons)
  container.bindSingleton(
    TOKENS.SessionManager,
    () => new TerminalSessionManager(),
  );
  container.bindSingleton(TOKENS.CommandRunner, (c) => {
    const sessionManager = c.get<TerminalSessionManager>(TOKENS.SessionManager);
    const logger = c.get<Logger>(TOKENS.Logger);
    return new CommandRunner(sessionManager, logger);
  });

  // Patch services
  container.bindSingleton(TOKENS.PatchParser, () => new PatchParser());

  container.bindSingleton(TOKENS.PatchValidator, (c) => {
    const root = c.get<string>(TOKENS.WorkspaceRoot);
    return new PatchValidator(root);
  });

  container.bindSingleton(TOKENS.RollbackManager, () => new RollbackManager());

  container.bindSingleton(TOKENS.PatchApplier, (c) => {
    const root = c.get<string>(TOKENS.WorkspaceRoot);
    const parser = c.get<PatchParser>(TOKENS.PatchParser);
    const validator = c.get<PatchValidator>(TOKENS.PatchValidator);
    const rollbackManager = c.get<RollbackManager>(TOKENS.RollbackManager);
    const logger = c.get<Logger>(TOKENS.Logger);
    return new PatchApplier(root, parser, validator, rollbackManager, logger);
  });

  // Runtime services
  container.bindSingleton(
    TOKENS.RuntimeEventEmitter,
    () => new RuntimeEventEmitter(),
  );

  container.bindSingleton(
    TOKENS.RuntimeStateManager,
    () => new RuntimeStateManager(),
  );

  container.bindSingleton(TOKENS.CheckpointManager, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    return new CheckpointManager(logger);
  });

  container.bindSingleton(TOKENS.TaskQueue, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    return new TaskQueue(logger);
  });

  // Transient: new instance per resolution
  container.bind(TOKENS.RuntimeMetrics, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    return new RuntimeMetrics(logger);
  });

  container.bind(TOKENS.IterationGuard, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    const eventEmitter = c.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    return new IterationGuard(logger, eventEmitter);
  });

  container.bind(TOKENS.CancellationManager, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    const eventEmitter = c.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    return new CancellationManager(logger, eventEmitter);
  });

  container.bind(TOKENS.RecoveryManager, (c) => {
    const logger = c.get<Logger>(TOKENS.Logger);
    const checkpointManager = c.get<CheckpointManager>(
      TOKENS.CheckpointManager,
    );
    const eventEmitter = c.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
    return new RecoveryManager(logger, checkpointManager, eventEmitter);
  });

  // Note: ExecutionEngine and AgentLoop require a provider instance
  // which needs async config loading. These will be created on-demand
  // when actually used, not pre-registered in DI.
  // See extension.ts for manual instantiation when needed.
}

async function requestPermissionInWebview(
  eventEmitter: RuntimeEventEmitter,
  request: ApprovalRequest,
): Promise<ApprovalResponse> {
  const description = compactPermissionDescription(request.description);
  const answers = await askUserQuestion(eventEmitter, {
    title: "Permission",
    question: `${riskLabel(request.riskLevel)} Allow Korix to execute ${request.tool}? ${description}`,
    mode: "single",
    options: [
      {
        value: "once",
        label: "Approve once",
        description: "Allow this execution only.",
      },
      {
        value: "always",
        label: "Always allow",
        description: "Allow this tool automatically in future runs.",
      },
      {
        value: "reject",
        label: "Reject",
        description: "Block this execution and continue safely.",
      },
      {
        value: "never",
        label: "Never allow",
        description: "Block this tool automatically in future runs.",
      },
    ],
    timeoutMs: 60000,
    defaultAnswer: "reject",
  });

  switch (answers[0] ?? "reject") {
    case "once":
      return { approved: true, level: "once" };
    case "always":
      return { approved: true, remember: true, level: "always" };
    case "never":
      return { approved: false, remember: true, level: "never" };
    case "reject":
    default:
      return { approved: false };
  }
}

function compactPermissionDescription(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();

  if (compact.length === 0) {
    return "Review the tool request before continuing.";
  }

  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function riskLabel(riskLevel: ApprovalRequest["riskLevel"]): string {
  switch (riskLevel) {
    case "low":
      return "Low risk.";
    case "medium":
      return "Medium risk.";
    case "high":
      return "High risk.";
  }
}
