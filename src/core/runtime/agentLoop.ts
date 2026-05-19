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
import type { AgentLoopResult } from "./runtimeTypes";
import type { RuntimeEvent } from "./runtimeEvents";

export class AgentLoop {
  constructor(
    private readonly engine: ExecutionEngine,
    private readonly checkpointManager: CheckpointManager,
    private readonly recoveryManager: RecoveryManager,
    private readonly iterationGuard: IterationGuard,
    private readonly cancellationManager: CancellationManager,
    private readonly metrics: RuntimeMetrics,
    // @ts-expect-error - Reserved for future use
    private readonly __eventEmitter: RuntimeEventEmitter,
    private readonly logger: Logger,
  ) {}

  async *run(
    initialMessage: string,
    context: ExecutionContext,
    previousMessages?: readonly {
      role: "user" | "assistant" | "system";
      content: string;
    }[],
  ): AsyncGenerator<RuntimeEvent, AgentLoopResult> {
    const state = new RuntimeState(context, 25);

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
          stepResult = await this.engine.step(state);
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

        // Stop if end_turn with no regular tool calls
        // OR if we had interactive tool calls (force one question at a time)
        if ((isEndTurn && !stepResult.hadToolCalls) || stepResult.hadInteractiveToolCalls) {
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
}
