/**
 * Execution Engine - stream processor & state coordinator (THE BRAIN)
 *
 * Orchestrates: Provider ↔ Tools ↔ State
 * Transforms: StreamChunk → RuntimeEvent
 * Executes: Tools sequentially with permission checking
 */

import type {
  AIProvider,
  ProviderEvent,
  RequestContext,
} from "../providers/types";
import {
  ToolRegistry,
  type ToolContext,
  type ToolRegistry as ToolRegistryType,
} from "../../harness/toolRegistry";
import type { PermissionManager } from "../../harness/permissions";
import type { Logger } from "../../telemetry/logger";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { CheckpointManager } from "./checkpoints";
import { AgentLoop } from "./agentLoop";
import { RuntimeMetrics } from "./runtimeMetrics";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { RecoveryManager } from "./recovery";
import { RuntimeState } from "./runtimeState";
import type { StepResult } from "./runtimeTypes";
import { ObservationEngine } from "./thinking/ObservationEngine";
import type { ToolUsePolicy } from "./thinking/types";
import { SubagentRunner } from "../subagent/subagentRunner";

interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

interface ExecutedToolCall {
  readonly id: string;
  readonly name: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export interface ExecutionEngineOptions {
  readonly toolPolicy?: "auto" | "disabled";
  readonly maxTokens?: number;
}

export interface ExecutionStepOptions {
  readonly toolUsePolicy?: ToolUsePolicy;
}

export class ExecutionEngine {
  private currentTextBuffer = "";
  private currentThinkingBuffer = "";
  private pendingToolCalls: PendingToolCall[] = [];
  private readonly observationEngine = new ObservationEngine();

  constructor(
    private readonly provider: AIProvider,
    private readonly toolRegistry: ToolRegistryType,
    private readonly permissionManager: PermissionManager,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly __checkpointManager: CheckpointManager,
    private readonly metrics: RuntimeMetrics,
    private readonly iterationGuard: IterationGuard,
    private readonly cancellationManager: CancellationManager,
    private readonly logger: Logger,
    private readonly systemPrompt: string,
    private readonly options: ExecutionEngineOptions = {},
  ) {}

  async step(
    state: RuntimeState,
    stepOptions: ExecutionStepOptions = {},
  ): Promise<StepResult> {
    this.resetBuffers();

    const result: StepResult = {
      hadToolCalls: false,
      hadThinking: false,
      tokenCount: 0,
      recoverable: true,
    };

    try {
      // Prepare messages and tools
      const conversation = state.getConversation();
      const activeToolPolicy = stepOptions.toolUsePolicy;
      const tools =
        this.options.toolPolicy === "disabled" ||
        activeToolPolicy?.mode === "none"
          ? []
          : this.toolRegistry.toProviderDefinitions(
              state.getContext().mode,
              activeToolPolicy?.allowedTools ?? [],
            );
      const toolChoice = this.resolveToolChoice(activeToolPolicy, tools.length);

      // DEBUG: Log tools being sent
      this.logger.info("[ExecutionEngine] Sending tools to provider", {
        toolCount: tools.length,
        toolNames: tools.map((t) => t.name),
        hasAskUserQuestion: tools.some((t) => t.name === "AskUserQuestion"),
      });

      // Build request context
      const context: RequestContext = {
        correlationId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(), // TODO: Get from DI container session manager
        agentRunId: crypto.randomUUID(),
        iterationId: state.getExecution().currentIteration,
      };
      const providerStartedAt = Date.now();
      let firstProviderOutputEmitted = false;

      this.eventEmitter.emitEvent({
        type: "provider_request_start",
        iteration: state.getExecution().currentIteration,
        correlationId: context.correlationId,
        toolCount: tools.length,
        ...(toolChoice
          ? { toolChoice: this.formatToolChoiceForEvent(toolChoice) }
          : {}),
        timestamp: providerStartedAt,
      });

      // Stream from provider
      const stream = this.provider.send(
        {
          messages: [...conversation.messages], // Copy readonly array
          ...(tools.length > 0 ? { tools } : {}),
          ...(toolChoice ? { toolChoice } : {}),
          maxTokens: this.resolveMaxTokens(),
          system: this.systemPrompt,
        },
        context,
      );

      // Process stream events
      for await (const event of stream) {
        this.cancellationManager.checkCancellation();

        if (!firstProviderOutputEmitted) {
          const outputKind = this.resolveFirstProviderOutputKind(event);
          if (outputKind) {
            firstProviderOutputEmitted = true;
            this.eventEmitter.emitEvent({
              type: "provider_first_output",
              iteration: state.getExecution().currentIteration,
              correlationId: context.correlationId,
              outputKind,
              latency: Date.now() - providerStartedAt,
              timestamp: Date.now(),
            });
            this.metrics.recordProviderFirstOutputLatency(
              Date.now() - providerStartedAt,
            );
          }
        }

        this.processEvent(event, state, result);
      }

      const providerDuration = Date.now() - providerStartedAt;
      this.metrics.recordProviderDuration(providerDuration);
      this.eventEmitter.emitEvent({
        type: "provider_request_end",
        iteration: state.getExecution().currentIteration,
        correlationId: context.correlationId,
        duration: providerDuration,
        stopReason: result.stopReason,
        tokenCount: result.tokenCount,
        hadToolCalls: this.pendingToolCalls.length > 0,
        timestamp: Date.now(),
      });

      // Add assistant message if text or tool calls were generated
      if (this.currentTextBuffer || this.pendingToolCalls.length > 0) {
        // Build content: text + tool calls
        const content = this.currentTextBuffer || "";

        // Anthropic format: assistant message with tool_use blocks
        // For now, just add text - tool calls are tracked separately
        // TODO: Add tool_use blocks to content for proper Anthropic format

        state.addMessage({
          role: "assistant",
          content,
          timestamp: Date.now(),
          metadata: {
            toolCalls: this.pendingToolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })),
          },
        });
      }

      // Execute pending tool calls (separate regular vs interactive)
      if (this.pendingToolCalls.length > 0) {
        const regularTools: typeof this.pendingToolCalls = [];
        const interactiveTools: typeof this.pendingToolCalls = [];

        // Separate tool calls by type
        for (const toolCall of this.pendingToolCalls) {
          const toolDef = this.toolRegistry.get(toolCall.name);
          if (toolDef?.isInteractive) {
            interactiveTools.push(toolCall);
          } else {
            regularTools.push(toolCall);
          }
        }

        // Execute regular tools first (these trigger loop continuation)
        let regularOutcomes: readonly ExecutedToolCall[] = [];
        if (regularTools.length > 0) {
          this.pendingToolCalls = regularTools;
          regularOutcomes = await this.executeToolCalls(state);
          result.hadToolCalls = true;
        }

        // Execute interactive tools (these don't trigger loop continuation)
        let interactiveOutcomes: readonly ExecutedToolCall[] = [];
        if (interactiveTools.length > 0) {
          this.pendingToolCalls = interactiveTools;
          interactiveOutcomes = await this.executeToolCalls(state);
          result.hadInteractiveToolCalls = true;

          if (
            this.shouldCompleteAfterInteractiveTools(
              state,
              regularTools.length > 0,
              interactiveTools,
              interactiveOutcomes,
            )
          ) {
            result.completeAfterInteractiveToolCalls = true;
            result.syntheticResponse =
              this.buildInteractiveCompletionResponse(interactiveOutcomes);
          }
        }

        if (activeToolPolicy?.mode === "required") {
          result.requiredToolSatisfied = [
            ...regularOutcomes,
            ...interactiveOutcomes,
          ].some((outcome) => outcome.success);
        }

        // Clear pending tools
        this.pendingToolCalls = [];
      } else if (activeToolPolicy?.mode === "required") {
        result.requiredToolSatisfied = false;
      }

      // NOTE: Don't emit "done" here! The agentLoop emits it when the entire
      // loop completes, not after each iteration. Emitting here would send
      // multiple "done" events if the loop has multiple iterations.

      return result;
    } catch (error) {
      this.logger.error("Execution step failed", error);
      result.error = (error as Error).message;
      result.recoverable = this.isRecoverable(error as Error);

      // NOTE: Don't emit "done" here either - agentLoop handles it
      throw error;
    }
  }

  private processEvent(
    event: ProviderEvent,
    state: RuntimeState,
    result: StepResult,
  ): void {
    switch (event.type) {
      case "token":
        this.currentTextBuffer += event.value;
        this.metrics.recordToken();
        result.tokenCount++;
        this.eventEmitter.emitEvent({
          type: "token",
          content: event.value,
          timestamp: Date.now(),
        });
        break;

      case "thinking":
        this.currentThinkingBuffer += event.value;
        result.hadThinking = true;
        this.eventEmitter.emitEvent({
          type: "thinking",
          content: event.value,
          timestamp: Date.now(),
        });
        break;

      case "tool_call_complete":
        this.logger.info("tool_call_complete received", {
          name: event.name,
          id: event.id,
          argsLength: event.arguments.length,
        });
        this.logger.debug("Raw JSON arguments", {
          args: event.arguments.substring(0, 500),
        });

        try {
          const parsedInput: unknown = JSON.parse(event.arguments);
          this.logger.info("Successfully parsed tool input", {
            name: event.name,
            input: JSON.stringify(parsedInput, null, 2).substring(0, 500),
          });

          this.pendingToolCalls.push({
            id: event.id,
            name: event.name,
            input: parsedInput,
          });

          this.eventEmitter.emitEvent({
            type: "tool_call",
            id: event.id,
            name: event.name,
            input: parsedInput,
            timestamp: Date.now(),
          });
        } catch (error) {
          this.logger.error("CRITICAL: Failed to parse JSON for tool", {
            name: event.name,
            rawArgs: event.arguments,
            error: (error as Error).message,
          });

          // Emit error event so the webview knows something went wrong
          this.eventEmitter.emitEvent({
            type: "error",
            error: `Failed to parse tool arguments for ${event.name}: ${(error as Error).message}`,
            iteration: state.getExecution().currentIteration,
            recoverable: false,
            timestamp: Date.now(),
          });
        }
        break;

      case "usage":
        // Usage events are tracked internally but not emitted to RuntimeEventEmitter
        // Metrics are recorded in the final metadata
        break;

      case "finish":
        result.stopReason = event.reason as
          | "end_turn"
          | "stop"
          | "max_tokens"
          | "stop_sequence"
          | undefined;
        // NOTE: Don't emit "done" here! It's emitted after tool execution in step()
        break;

      case "error":
        throw event.error;

      case "tool_call_delta":
        // LiteLLMNormalizer already assembles deltas into tool_call_complete
        // This case is here for completeness but should not be reached
        break;
    }
  }

  private async executeToolCalls(
    state: RuntimeState,
  ): Promise<readonly ExecutedToolCall[]> {
    // Early exit if no tools to execute
    if (this.pendingToolCalls.length === 0) {
      return [];
    }

    // Check permissions for tools that explicitly require approval.
    const approvedCalls: typeof this.pendingToolCalls = [];
    const toolContext = this.buildToolContext(state);

    for (const toolCall of this.pendingToolCalls) {
      this.cancellationManager.checkCancellation();
      this.iterationGuard.recordToolCall(toolCall.name);

      const toolDef = this.toolRegistry.get(toolCall.name);
      const riskLevel = this.inferRiskLevel(toolCall.name);
      const requiresApproval =
        toolDef?.requiresApproval?.(toolCall.input, toolContext) ??
        riskLevel !== "low";

      if (requiresApproval) {
        const approvalStartedAt = Date.now();
        this.eventEmitter.emitEvent({
          type: "tool_approval_required",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          timestamp: approvalStartedAt,
        });

        const response = await this.permissionManager.checkPermission({
          tool: toolCall.name,
          input: toolCall.input,
          description: toolDef?.description ?? `Execute ${toolCall.name}`,
          riskLevel,
        });
        const approvalDuration = Date.now() - approvalStartedAt;
        this.metrics.recordApprovalWait(approvalDuration);

        if (!response.approved) {
          this.eventEmitter.emitEvent({
            type: "tool_denied",
            id: toolCall.id,
            name: toolCall.name,
            reason: "Permission denied",
            duration: approvalDuration,
            timestamp: Date.now(),
          });
          continue;
        }

        this.eventEmitter.emitEvent({
          type: "tool_approved",
          id: toolCall.id,
          name: toolCall.name,
          duration: approvalDuration,
          timestamp: Date.now(),
        });
      }

      approvedCalls.push(toolCall);
    }

    // Detect dependencies and prepare tasks for scheduler
    const tasks = this.prepareSchedulerTasks(approvedCalls);

    // Create executor function for scheduler
    const executor = async (tool: string, input: unknown) => {
      return await this.toolRegistry.execute(tool, input, toolContext);
    };

    // Execute via scheduler (parallel when possible)
    const scheduler = this.toolRegistry.getScheduler();
    const taskResults = await scheduler.scheduleMany(tasks, executor);
    const outcomes: ExecutedToolCall[] = [];

    // Process results in order
    for (let i = 0; i < approvedCalls.length; i++) {
      const toolCall = approvedCalls[i];
      const taskResult = taskResults[i];

      if (!toolCall || !taskResult) {
        continue;
      }

      const result = taskResult.result;
      outcomes.push({
        id: toolCall.id,
        name: toolCall.name,
        success: result.success,
        data: result.data,
        error: result.error,
      });

      const duration = result.metadata?.duration ?? 0;
      this.metrics.recordToolDuration(duration);
      const observationSummary = this.observationEngine.summarizeToolResult(
        toolCall.name,
        result.success ? result.data : { error: result.error },
        result.success,
      );

      // Record metrics
      this.metrics.recordToolCall(toolCall.name);
      state.recordToolCall(
        toolCall.name,
        toolCall.input,
        result.data,
        duration,
        result.success,
      );
      state.addObservationSummary(observationSummary);

      // Auto cache invalidation after successful writes
      if (result.success) {
        this.handleCacheInvalidation(toolCall.name, toolCall.input);
      }

      // Emit result
      this.eventEmitter.emitEvent({
        type: "tool_result",
        id: toolCall.id,
        name: toolCall.name,
        success: result.success,
        result: result.data,
        duration,
        timestamp: Date.now(),
      });

      // Add tool result message (including interactive tools)
      // Interactive tools MUST be included so the LLM knows the user's answer
      const toolContent = this.observationEngine.toToolMessageContent(
        observationSummary,
        result.data ?? { error: result.error },
      );

      state.addMessage({
        role: "tool",
        content: toolContent,
        timestamp: Date.now(),
        metadata: { toolCallId: toolCall.id, toolName: toolCall.name },
      });
    }

    return outcomes;
  }

  private shouldCompleteAfterInteractiveTools(
    state: RuntimeState,
    hadRegularToolCalls: boolean,
    interactiveTools: readonly PendingToolCall[],
    interactiveOutcomes: readonly ExecutedToolCall[],
  ): boolean {
    if (hadRegularToolCalls || interactiveTools.length === 0) {
      return false;
    }

    if (
      !interactiveTools.every((toolCall) => toolCall.name === "AskUserQuestion")
    ) {
      return false;
    }

    if (!interactiveOutcomes.every((outcome) => outcome.success)) {
      return false;
    }

    if (this.currentTextBuffer.trim().length > 0) {
      return false;
    }

    const conversation = state.getConversation();
    const userMessages = conversation.messages.filter(
      (message) => message.role === "user",
    );
    const latestUserMessage =
      userMessages[userMessages.length - 1]?.content ?? "";

    return this.isDirectQuestionPresentationRequest(latestUserMessage);
  }

  private isDirectQuestionPresentationRequest(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const asksForQuestion =
      /\b(faca|crie|gere|monte|elabore|pergunte|ask|make|create|generate)\b/.test(
        normalized,
      ) && /\b(pergunta|question)\b/.test(normalized);
    const asksForOptions =
      /\b(opcao|opcoes|option|options|alternativa|alternativas|choices)\b/.test(
        normalized,
      );

    return asksForQuestion && asksForOptions;
  }

  private buildInteractiveCompletionResponse(
    outcomes: readonly ExecutedToolCall[],
  ): string {
    const answer = outcomes
      .flatMap((outcome) => this.extractAnswers(outcome.data))
      .filter((item) => item.trim().length > 0)
      .join(", ");

    if (!answer) {
      return "Resposta registrada.";
    }

    return `Resposta registrada: ${answer}.`;
  }

  private extractAnswers(value: unknown): string[] {
    if (typeof value === "string") {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }

    if (this.isRecord(value)) {
      return Object.values(value).flatMap((item) => this.extractAnswers(item));
    }

    return [];
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private buildToolContext(state: RuntimeState): ToolContext {
    const workspace = state.getWorkspace();
    const context = state.getContext();

    return {
      execution: {
        mode: context.mode,
        workspaceRoot: workspace.root,
        openFiles: Array.from(workspace.openFiles),
        ...(workspace.currentFile
          ? { currentFile: workspace.currentFile }
          : {}),
        ...(workspace.selection ? { selection: workspace.selection } : {}),
      },
      workspaceRoot: workspace.root,
      updateTodos: (todos) => {
        const updated = state.updateTodos(todos);
        this.eventEmitter.emitEvent({
          type: "todos_updated",
          todos: updated,
          timestamp: Date.now(),
        });
        return updated;
      },
      getTodos: () => state.getTodos(),
      runSubagent: (request) => {
        const runner = new SubagentRunner({
          parentRegistry: this.toolRegistry,
          createRegistry: () => new ToolRegistry(),
          createAgentLoop: (registry, systemPrompt) => {
            const metrics = new RuntimeMetrics(this.logger);
            const iterationGuard = new IterationGuard(
              this.logger,
              this.eventEmitter,
            );
            const cancellationManager = new CancellationManager(
              this.logger,
              this.eventEmitter,
            );
            const recoveryManager = new RecoveryManager(
              this.logger,
              this.__checkpointManager,
              this.eventEmitter,
            );
            const engine = new ExecutionEngine(
              this.provider,
              registry,
              this.permissionManager,
              this.eventEmitter,
              this.__checkpointManager,
              metrics,
              iterationGuard,
              cancellationManager,
              this.logger,
              systemPrompt,
              this.options,
            );

            return new AgentLoop(
              engine,
              this.__checkpointManager,
              recoveryManager,
              iterationGuard,
              cancellationManager,
              metrics,
              this.eventEmitter,
              this.logger,
            );
          },
        });

        return runner.run(request);
      },
    };
  }

  private resetBuffers(): void {
    this.currentTextBuffer = "";
    this.currentThinkingBuffer = "";
    this.pendingToolCalls = [];
  }

  private inferRiskLevel(toolName: string): "low" | "medium" | "high" {
    const lowerName = toolName.toLowerCase();

    // High risk: write, edit, delete, execute, run commands
    if (/write|edit|delete|remove|execute|run|command|patch/.test(lowerName)) {
      return "high";
    }

    // Low risk: read-only operations
    if (/read|list|get|search|find|grep|status|diff/.test(lowerName)) {
      return "low";
    }

    // Default: medium risk
    return "medium";
  }

  private resolveMaxTokens(): number {
    return this.options.maxTokens ?? this.provider.config.maxTokens ?? 4096;
  }

  private resolveFirstProviderOutputKind(
    event: ProviderEvent,
  ): "token" | "thinking" | "tool_call" | undefined {
    if (event.type === "token") {
      return "token";
    }

    if (event.type === "thinking") {
      return "thinking";
    }

    if (
      event.type === "tool_call_complete" ||
      event.type === "tool_call_delta"
    ) {
      return "tool_call";
    }

    return undefined;
  }

  private resolveToolChoice(
    policy: ToolUsePolicy | undefined,
    toolCount: number,
  ):
    | "none"
    | "auto"
    | "required"
    | {
        readonly type: "tool";
        readonly name: string;
      }
    | undefined {
    if (!policy || toolCount === 0) {
      return undefined;
    }

    if (policy.mode === "required") {
      return "required";
    }

    if (policy.mode === "auto") {
      return "auto";
    }

    return "none";
  }

  private formatToolChoiceForEvent(
    toolChoice:
      | "none"
      | "auto"
      | "required"
      | {
          readonly type: "tool";
          readonly name: string;
        },
  ): string {
    if (typeof toolChoice === "string") {
      return toolChoice;
    }

    return toolChoice.name;
  }

  /**
   * Handle cache invalidation after successful tool execution
   *
   * Invalidates cache for:
   * - ReadFile/ListDirectory after WriteFile/EditFile
   * - Git tools after .git/ modifications
   * - Search tools after file additions/removals
   */
  private handleCacheInvalidation(toolName: string, input: unknown): void {
    try {
      // WriteFile or EditFile - invalidate read cache for that file
      if (toolName === "WriteFile" || toolName === "EditFile") {
        const filePath = (input as { path?: string }).path;
        if (filePath) {
          // Invalidate ReadFile cache for this specific file
          this.toolRegistry.invalidateCache(
            new RegExp(`ReadFile.*${this.escapeRegex(filePath)}`),
          );

          // Invalidate ListDirectory for parent directory
          const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
          if (dirPath) {
            this.toolRegistry.invalidateCache(
              new RegExp(`ListDirectory.*${this.escapeRegex(dirPath)}`),
            );
          }

          // If .git/ file modified, invalidate all git tools
          if (filePath.includes(".git/")) {
            this.toolRegistry.invalidateCache(/^Git/);
            this.logger.debug(
              "Git cache invalidated after .git/ modification",
              { path: filePath },
            );
          }

          this.logger.debug("Cache invalidated after file write", {
            path: filePath,
            tool: toolName,
          });
        }
      }

      // DeleteFile - invalidate directory listing and file reads
      if (toolName === "DeleteFile") {
        const filePath = (input as { path?: string }).path;
        if (filePath) {
          this.toolRegistry.invalidateCache(
            new RegExp(`ReadFile.*${this.escapeRegex(filePath)}`),
          );

          const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
          if (dirPath) {
            this.toolRegistry.invalidateCache(
              new RegExp(`ListDirectory.*${this.escapeRegex(dirPath)}`),
            );
          }

          this.logger.debug("Cache invalidated after file deletion", {
            path: filePath,
          });
        }
      }

      // RunCommand with git - invalidate git tools cache
      if (toolName === "RunCommand") {
        const command = (input as { command?: string }).command;
        if (command?.startsWith("git ")) {
          this.toolRegistry.invalidateCache(/^Git/);
          this.logger.debug("Git cache invalidated after git command", {
            command,
          });
        }
      }
    } catch (error) {
      // Non-critical - log but don't fail tool execution
      this.logger.warn("Cache invalidation failed", {
        error: (error as Error).message,
        tool: toolName,
      });
    }
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Prepare scheduler tasks from tool calls with dependency detection
   *
   * Detects dependencies using heuristics:
   * - ReadFile after WriteFile/EditFile on same file
   * - Git tools after git commands
   * - Sequential execution for tools without clear independence
   */
  private prepareSchedulerTasks(
    toolCalls: Array<{ id: string; name: string; input: unknown }>,
  ): Array<{
    id: string;
    tool: string;
    input: unknown;
    priority: number;
    dependencies?: string[];
  }> {
    const tasks: Array<{
      id: string;
      tool: string;
      input: unknown;
      priority: number;
      dependencies?: string[];
    }> = [];

    // Track write operations for dependency detection
    const writeOperations: Map<string, string> = new Map(); // path → task id

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      if (!toolCall) continue;

      const taskId = `task-${i}`;
      const dependencies: string[] = [];

      // Detect dependencies based on tool type
      if (toolCall.name === "ReadFile" || toolCall.name === "ListDirectory") {
        const path = (toolCall.input as { path?: string }).path;
        if (path) {
          // Check if a previous task writes to this path
          const writerTaskId = writeOperations.get(path);
          if (writerTaskId) {
            dependencies.push(writerTaskId);
          }
        }
      }

      // Git tools depend on previous git operations
      if (toolCall.name.startsWith("Git")) {
        // Find previous git command or git tool
        for (let j = i - 1; j >= 0; j--) {
          const prev = toolCalls[j];
          if (
            prev?.name === "RunCommand" &&
            (prev.input as { command?: string }).command?.startsWith("git ")
          ) {
            dependencies.push(`task-${j}`);
            break;
          }
          if (prev?.name.startsWith("Git")) {
            // Don't depend on other git tools (they can run in parallel)
            break;
          }
        }
      }

      // Track write operations
      if (
        toolCall.name === "WriteFile" ||
        toolCall.name === "EditFile" ||
        toolCall.name === "DeleteFile"
      ) {
        const path = (toolCall.input as { path?: string }).path;
        if (path) {
          writeOperations.set(path, taskId);
        }
      }

      tasks.push({
        id: taskId,
        tool: toolCall.name,
        input: toolCall.input,
        priority: this.inferToolPriority(toolCall.name),
        dependencies: dependencies.length > 0 ? dependencies : undefined,
      });
    }

    return tasks;
  }

  /**
   * Infer priority for tool execution (0-10, higher = more urgent)
   *
   * Priority levels:
   * - 8-10: Write operations (must complete before reads)
   * - 5-7: Git operations and search (moderate priority)
   * - 3-4: Read operations (can wait, run in parallel)
   * - 1-2: Diagnostic tools (lowest priority)
   */
  private inferToolPriority(toolName: string): number {
    const lowerName = toolName.toLowerCase();

    // High priority (8-10): Write operations
    if (/write|edit|delete|remove|patch/.test(lowerName)) {
      return 8;
    }

    // Medium-high priority (7): Commands and execution
    if (/command|run|execute/.test(lowerName)) {
      return 7;
    }

    // Medium priority (5-6): Git and search operations
    if (/git/.test(lowerName)) {
      return 6;
    }
    if (/search|find|grep/.test(lowerName)) {
      return 5;
    }

    // Low priority (3-4): Read operations
    if (/read|list|get/.test(lowerName)) {
      return 3;
    }

    // Lowest priority (2): Diagnostics
    if (/diagnostic|problem|status/.test(lowerName)) {
      return 2;
    }

    // Default medium priority
    return 5;
  }

  private isRecoverable(error: Error): boolean {
    return /timeout|ECONNREFUSED|rate.*limit|429|503/i.test(error.message);
  }
}
