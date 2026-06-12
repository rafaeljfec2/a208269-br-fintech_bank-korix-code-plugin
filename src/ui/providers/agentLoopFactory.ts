/**
 * AgentLoopFactory - Creates provider instances and AgentLoop with dependencies
 */

import type { Container } from "../../di/container";
import type { Logger } from "../../telemetry/logger";
import type { RuntimeEventEmitter } from "../../core/runtime/runtimeEvents";
import type { CheckpointManager } from "../../core/runtime/checkpoints";
import type { PermissionManager } from "../../harness/permissions";
import type { ToolRegistry } from "../../harness/toolRegistry";
import type { AIProvider } from "../../core/providers/types";
import type { ProviderConfig } from "../../providers/types";
import { LiteLLMFactory } from "../../core/providers/litellm/litellmFactory";
import { OpenAIFactory } from "../../core/providers/openai/openaiFactory";
import { AgentLoop } from "../../core/runtime/agentLoop";
import {
  ExecutionEngine,
  type ExecutionEngineOptions,
} from "../../core/runtime/executionEngine";
import { RecoveryManager } from "../../core/runtime/recovery";
import { IterationGuard } from "../../core/runtime/iterationGuard";
import { CancellationManager } from "../../core/runtime/cancellation";
import { RuntimeMetrics } from "../../core/runtime/runtimeMetrics";
import { TOKENS } from "../../di/tokens";

export class AgentLoopFactory {
  private readonly liteLlmFactory: LiteLLMFactory;
  private readonly openAiFactory: OpenAIFactory;

  constructor(
    private readonly container: Container,
    private readonly logger: Logger,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly checkpointManager: CheckpointManager,
    private readonly permissionManager: PermissionManager,
  ) {
    this.liteLlmFactory = new LiteLLMFactory(this.logger);
    this.openAiFactory = new OpenAIFactory(this.logger);
  }

  /**
   * Create provider instance based on config
   */
  createProvider(config: ProviderConfig): AIProvider {
    if (config.type === "openai") {
      return this.openAiFactory.create(config) as unknown as AIProvider;
    }
    // Use LiteLLM factory (supports all provider types)
    // Type assertion needed due to dual type hierarchies (will be unified in future refactor)
    return this.liteLlmFactory.create(config) as unknown as AIProvider;
  }

  /**
   * Create AgentLoop with all dependencies
   */
  createAgentLoop(
    provider: AIProvider,
    systemPrompt: string,
    executionOptions: ExecutionEngineOptions = {},
  ): AgentLoop {
    const toolRegistry = this.container.get<ToolRegistry>(TOKENS.ToolRegistry);

    // Create transient instances per execution
    const metrics = new RuntimeMetrics(this.logger);
    const iterationGuard = new IterationGuard(this.logger, this.eventEmitter);
    const cancellationManager = new CancellationManager(
      this.logger,
      this.eventEmitter,
    );
    const recoveryManager = new RecoveryManager(
      this.logger,
      this.checkpointManager,
      this.eventEmitter,
    );

    // Create ExecutionEngine with system prompt
    const executionEngine = new ExecutionEngine(
      provider,
      toolRegistry,
      this.permissionManager,
      this.eventEmitter,
      this.checkpointManager,
      metrics,
      iterationGuard,
      cancellationManager,
      this.logger,
      systemPrompt,
      executionOptions,
    );

    // Create AgentLoop
    return new AgentLoop(
      executionEngine,
      this.checkpointManager,
      recoveryManager,
      iterationGuard,
      cancellationManager,
      metrics,
      this.eventEmitter,
      this.logger,
    );
  }
}
