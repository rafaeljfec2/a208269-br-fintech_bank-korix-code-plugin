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
import type { ToolRegistry } from "../../harness/toolRegistry";
import type { PermissionManager } from "../../harness/permissions";
import type { Logger } from "../../telemetry/logger";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { CheckpointManager } from "./checkpoints";
import { RuntimeMetrics } from "./runtimeMetrics";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { RuntimeState } from "./runtimeState";
import type { StepResult } from "./runtimeTypes";

interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

export class ExecutionEngine {
  private currentTextBuffer = "";
  private currentThinkingBuffer = "";
  private pendingToolCalls: PendingToolCall[] = [];

  constructor(
    private readonly provider: AIProvider,
    private readonly toolRegistry: ToolRegistry,
    private readonly permissionManager: PermissionManager,
    private readonly eventEmitter: RuntimeEventEmitter,
    // @ts-expect-error - Reserved for future use
    private readonly __checkpointManager: CheckpointManager,
    private readonly metrics: RuntimeMetrics,
    private readonly iterationGuard: IterationGuard,
    private readonly cancellationManager: CancellationManager,
    private readonly logger: Logger,
    private readonly systemPrompt: string,
  ) {}

  async step(state: RuntimeState): Promise<StepResult> {
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
      const tools = this.toolRegistry.toProviderDefinitions();

      // Build request context
      const context: RequestContext = {
        correlationId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(), // TODO: Get from DI container session manager
        agentRunId: crypto.randomUUID(),
        iterationId: state.getExecution().currentIteration,
      };

      // Stream from provider
      const stream = this.provider.send(
        {
          messages: [...conversation.messages], // Copy readonly array
          tools,
          maxTokens: 4096,
          system: this.systemPrompt,
        },
        context,
      );

      // Process stream events
      for await (const event of stream) {
        this.cancellationManager.checkCancellation();

        this.processEvent(event, state, result);
      }

      // Add assistant message if text was generated
      if (this.currentTextBuffer) {
        state.addMessage({
          role: "assistant",
          content: this.currentTextBuffer,
          timestamp: Date.now(),
        });
      }

      // Execute pending tool calls
      if (this.pendingToolCalls.length > 0) {
        await this.executeToolCalls(state);
        result.hadToolCalls = true;
      }

      return result;
    } catch (error) {
      this.logger.error("Execution step failed", error);
      result.error = (error as Error).message;
      result.recoverable = this.isRecoverable(error as Error);
      throw error;
    }
  }

  private processEvent(
    event: ProviderEvent,
    _state: RuntimeState,
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
        this.pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: JSON.parse(event.arguments),
        });
        this.eventEmitter.emitEvent({
          type: "tool_call",
          id: event.id,
          name: event.name,
          input: JSON.parse(event.arguments),
          timestamp: Date.now(),
        });
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
        this.eventEmitter.emitEvent({
          type: "done",
          stopReason: event.reason,
          usage: undefined,
          timestamp: Date.now(),
        });
        break;

      case "error":
        throw event.error;

      case "tool_call_delta":
        // LiteLLMNormalizer already assembles deltas into tool_call_complete
        // This case is here for completeness but should not be reached
        break;
    }
  }

  private async executeToolCalls(state: RuntimeState): Promise<void> {
    // Early exit if no tools to execute
    if (this.pendingToolCalls.length === 0) {
      return;
    }

    // Check permissions for all tools first
    const approvedCalls: typeof this.pendingToolCalls = [];

    for (const toolCall of this.pendingToolCalls) {
      this.cancellationManager.checkCancellation();
      this.iterationGuard.recordToolCall(toolCall.name);

      const toolDef = this.toolRegistry.get(toolCall.name);
      const riskLevel = this.inferRiskLevel(toolCall.name);
      const response = await this.permissionManager.checkPermission({
        tool: toolCall.name,
        input: toolCall.input,
        description: toolDef?.description ?? `Execute ${toolCall.name}`,
        riskLevel,
      });

      if (!response.approved) {
        this.eventEmitter.emitEvent({
          type: "tool_denied",
          id: toolCall.id,
          name: toolCall.name,
          reason: "Permission denied",
          timestamp: Date.now(),
        });
        continue;
      }

      this.eventEmitter.emitEvent({
        type: "tool_approved",
        id: toolCall.id,
        name: toolCall.name,
        timestamp: Date.now(),
      });

      approvedCalls.push(toolCall);
    }

    // Detect dependencies and prepare tasks for scheduler
    const tasks = this.prepareSchedulerTasks(approvedCalls);

    // Create executor function for scheduler
    const workspace = state.getWorkspace();
    const executor = async (tool: string, input: unknown) => {
      return await this.toolRegistry.execute(tool, input, {
        execution: {
          mode: "agent",
          workspaceRoot: workspace.root,
          openFiles: Array.from(workspace.openFiles),
        },
        workspaceRoot: workspace.root,
      });
    };

    // Execute via scheduler (parallel when possible)
    const scheduler = this.toolRegistry.getScheduler();
    const taskResults = await scheduler.scheduleMany(tasks, executor);

    // Process results in order
    for (let i = 0; i < approvedCalls.length; i++) {
      const toolCall = approvedCalls[i];
      const taskResult = taskResults[i];

      if (!toolCall || !taskResult) {
        continue;
      }

      const result = taskResult.result;
      const duration = result.metadata?.duration ?? 0;

      // Record metrics
      this.metrics.recordToolCall(toolCall.name);
      state.recordToolCall(
        toolCall.name,
        toolCall.input,
        result.data,
        duration,
        result.success,
      );

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

      // Add tool result message
      state.addMessage({
        role: "tool",
        content: JSON.stringify(result.data ?? { error: result.error }),
        timestamp: Date.now(),
        metadata: { toolCallId: toolCall.id, toolName: toolCall.name },
      });
    }
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
          this.toolRegistry.invalidateCache(new RegExp(`ReadFile.*${this.escapeRegex(filePath)}`));

          // Invalidate ListDirectory for parent directory
          const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
          if (dirPath) {
            this.toolRegistry.invalidateCache(new RegExp(`ListDirectory.*${this.escapeRegex(dirPath)}`));
          }

          // If .git/ file modified, invalidate all git tools
          if (filePath.includes(".git/")) {
            this.toolRegistry.invalidateCache(/^Git/);
            this.logger.debug("Git cache invalidated after .git/ modification", { path: filePath });
          }

          this.logger.debug("Cache invalidated after file write", {
            path: filePath,
            tool: toolName
          });
        }
      }

      // DeleteFile - invalidate directory listing and file reads
      if (toolName === "DeleteFile") {
        const filePath = (input as { path?: string }).path;
        if (filePath) {
          this.toolRegistry.invalidateCache(new RegExp(`ReadFile.*${this.escapeRegex(filePath)}`));

          const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
          if (dirPath) {
            this.toolRegistry.invalidateCache(new RegExp(`ListDirectory.*${this.escapeRegex(dirPath)}`));
          }

          this.logger.debug("Cache invalidated after file deletion", { path: filePath });
        }
      }

      // RunCommand with git - invalidate git tools cache
      if (toolName === "RunCommand") {
        const command = (input as { command?: string }).command;
        if (command?.startsWith("git ")) {
          this.toolRegistry.invalidateCache(/^Git/);
          this.logger.debug("Git cache invalidated after git command", { command });
        }
      }
    } catch (error) {
      // Non-critical - log but don't fail tool execution
      this.logger.warn("Cache invalidation failed", {
        error: (error as Error).message,
        tool: toolName
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
