/**
 * Agent Loop - MINIMALISTA lifecycle orchestration
 *
 * Responsibilities:
 * - Lifecycle control (start, iterations, stop)
 * - Iteration counting
 * - Cancellation checking
 * - Recovery orchestration
 * - Supervision (guards, checkpoints)
 *
 * Delegates to:
 * - ExecutionEngine (provider ↔ tools)
 * - RecoveryManager (error handling)
 * - IterationGuard (loop prevention)
 * - CheckpointManager (snapshots)
 */

import type { Logger } from "../../telemetry/logger";
import type { ExecutionContext } from "../types";
import { ExecutionEngine } from "./executionEngine";
import { CheckpointManager } from "./checkpoints";
import { RecoveryManager } from "./recovery";
import { IterationGuard } from "./iterationGuard";
import { CancellationManager } from "./cancellation";
import { RuntimeMetrics } from "./runtimeMetrics";
import { RuntimeEventEmitter } from "./runtimeEvents";
import { RuntimeState } from "./runtimeState";
import type { AgentLoopResult, AgentLoopRunOptions } from "./runtimeTypes";
import type { RuntimeEvent } from "./runtimeEvents";
import type { ToolUsePolicy } from "./thinking/types";

const MAX_REQUIRED_TOOL_RETRIES = 1;

export class AgentLoop {
  constructor(
    private readonly engine: ExecutionEngine,
    private readonly checkpointManager: CheckpointManager,
    private readonly recoveryManager: RecoveryManager,
    private readonly iterationGuard: IterationGuard,
    private readonly cancellationManager: CancellationManager,
    private readonly metrics: RuntimeMetrics,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly logger: Logger,
  ) {}

  async *run(
    initialMessage: string,
    context: ExecutionContext,
    previousMessages?: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
    options: AgentLoopRunOptions = {},
  ): AsyncGenerator<RuntimeEvent, AgentLoopResult> {
    const state = new RuntimeState(context, options.maxIterations ?? 25);

    // Add previous messages for conversation history
    if (previousMessages && previousMessages.length > 0) {
      for (const msg of previousMessages) {
        // Skip system messages - not supported in runtime state
        if (msg.role === "system") {
          continue;
        }
        state.addMessage({
          role: msg.role,
          content: msg.content,
          timestamp: Date.now(),
        });
      }
    }

    // Add initial user message
    state.addMessage({
      role: "user",
      content: initialMessage,
      timestamp: Date.now(),
    });

    state.startExecution();
    let completed = false;
    let requiredToolRepairCount = 0;
    let requiredToolSatisfiedForRun = false;

    try {
      while (!completed) {
        this.cancellationManager.checkCancellation();

        const execution = state.getExecution();
        const iterationStartTime = Date.now();

        // Emit iteration start
        yield {
          type: "iteration_start",
          iteration: execution.currentIteration,
          timestamp: iterationStartTime,
        };

        // Check guards
        const guardResult = this.iterationGuard.checkIteration(state);
        if (guardResult.shouldStop) {
          this.logger.info("Guard triggered stop", {
            reason: guardResult.reason,
          });
          completed = true;
          break;
        }

        // Execute step
        let stepResult;
        try {
          const toolUsePolicy = this.resolveIterationToolUsePolicy(
            options.toolUsePolicy,
            requiredToolSatisfiedForRun,
          );
          stepResult = await this.engine.step(state, {
            toolUsePolicy,
          });
          this.recoveryManager.resetAttempts(
            `iteration_${execution.currentIteration}`,
          );
        } catch (error) {
          // Handle error via recovery
          const recoveryAction = this.recoveryManager.handleError(
            error as Error,
            state,
            `iteration_${execution.currentIteration}`,
          );

          await this.recoveryManager.executeRecovery(recoveryAction, state);

          if (recoveryAction.action === "fail") {
            throw error;
          }

          // Retry this iteration
          continue;
        }

        // Create checkpoint if had tool calls
        if (stepResult.hadToolCalls) {
          const workspace = state.getWorkspace();
          const checkpointId = await this.checkpointManager.create(
            state,
            new Set(workspace.modifiedFiles),
          );
          state.setCheckpoint(checkpointId);
          this.metrics.recordCheckpoint();

          yield {
            type: "checkpoint_created",
            checkpointId,
            iteration: execution.currentIteration,
            filesChanged: workspace.modifiedFiles.size,
            timestamp: Date.now(),
          };
        }

        // Record progress
        const workspace = state.getWorkspace();
        const conversation = state.getConversation();
        this.iterationGuard.recordProgress({
          iteration: execution.currentIteration,
          modifiedFiles: workspace.modifiedFiles.size,
          toolCallCount: conversation.toolCallHistory.length,
          timestamp: Date.now(),
        });

        if (
          stepResult.syntheticResponse &&
          stepResult.syntheticResponse.trim().length > 0
        ) {
          const tokenEvent: RuntimeEvent = {
            type: "token",
            content: stepResult.syntheticResponse,
            timestamp: Date.now(),
          };
          this.eventEmitter.emitEvent(tokenEvent);
        }

        // Increment iteration
        state.incrementIteration();
        this.metrics.recordIteration();

        // Emit iteration complete
        yield {
          type: "iteration_complete",
          iteration: execution.currentIteration,
          hadToolCalls: stepResult.hadToolCalls,
          duration: Date.now() - iterationStartTime,
          timestamp: Date.now(),
        };

        // Check completion
        // Accept both 'end_turn' (standard) and 'stop' (LiteLLM format)
        const isEndTurn =
          stepResult.stopReason === "end_turn" ||
          stepResult.stopReason === "stop";

        // Stop only when the provider ended without any tool work.
        // Interactive tools add a tool_result message with the user's answer,
        // so the loop must continue once more for the provider to respond.
        const interactiveToolsNeedProviderFollowup =
          stepResult.hadInteractiveToolCalls === true &&
          stepResult.completeAfterInteractiveToolCalls !== true;
        const hadAnyToolCalls =
          stepResult.hadToolCalls || interactiveToolsNeedProviderFollowup;
        const requiredToolUnsatisfied =
          options.toolUsePolicy?.mode === "required" &&
          !requiredToolSatisfiedForRun &&
          stepResult.requiredToolSatisfied !== true;

        if (
          options.toolUsePolicy?.mode === "required" &&
          stepResult.requiredToolSatisfied === true
        ) {
          requiredToolSatisfiedForRun = true;
        }

        if (
          requiredToolUnsatisfied &&
          requiredToolRepairCount < MAX_REQUIRED_TOOL_RETRIES
        ) {
          requiredToolRepairCount++;
          this.eventEmitter.clearBufferedResponse();
          continue;
        }

        if (
          requiredToolUnsatisfied ||
          stepResult.completeAfterInteractiveToolCalls === true ||
          (isEndTurn && !hadAnyToolCalls)
        ) {
          completed = true;
        }
      }

      // Success
      state.stopExecution();
      const metricsSnapshot = this.metrics.finalize();

      // FIX: Emit "done" when the entire loop completes, not after each iteration
      this.logger.info("[AgentLoop] Emitting done event", {
        completed: true,
        iterations: state.getExecution().currentIteration,
      });

      yield {
        type: "done",
        stopReason: "end_turn",
        usage: undefined,
        timestamp: Date.now(),
      };

      yield {
        type: "execution_complete",
        success: true,
        iterations: state.getExecution().currentIteration,
        metrics: metricsSnapshot,
        timestamp: Date.now(),
      };

      return {
        success: true,
        iterations: state.getExecution().currentIteration,
        finalState: state.createSnapshot(),
        metrics: metricsSnapshot,
      };
    } catch (error) {
      // Failure
      state.stopExecution();
      const metricsSnapshot = this.metrics.finalize();
      const err = error as Error;

      // FIX: Also emit "done" on error to ensure webview can recover
      yield {
        type: "done",
        stopReason: "error",
        usage: undefined,
        timestamp: Date.now(),
      };

      yield {
        type: "execution_complete",
        success: false,
        iterations: state.getExecution().currentIteration,
        metrics: metricsSnapshot,
        timestamp: Date.now(),
      };

      return {
        success: false,
        iterations: state.getExecution().currentIteration,
        finalState: state.createSnapshot(),
        metrics: metricsSnapshot,
        error: err.message,
      };
    }
  }

  private resolveIterationToolUsePolicy(
    policy: ToolUsePolicy | undefined,
    requiredToolSatisfiedForRun: boolean,
  ): ToolUsePolicy | undefined {
    if (policy?.mode !== "required" || !requiredToolSatisfiedForRun) {
      return policy;
    }

    return {
      ...policy,
      mode: "auto",
    };
  }
}
