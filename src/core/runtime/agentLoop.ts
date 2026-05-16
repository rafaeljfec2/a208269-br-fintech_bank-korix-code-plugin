/**
 * Main agent loop for iterative execution
 */

import type { Message } from "../types";
import { ExecutionEngine } from "./executionEngine";
import { RuntimeStateManager } from "./runtimeState";
import { CheckpointManager } from "./checkpoints";
import { TaskQueue } from "./taskQueue";
import type { StreamChunk } from "../../providers/types";

export interface AgentLoopOptions {
  executionEngine: ExecutionEngine;
  stateManager: RuntimeStateManager;
  checkpointManager?: CheckpointManager;
  taskQueue?: TaskQueue;
  maxIterations?: number;
}

export interface AgentLoopResult {
  success: boolean;
  iterations: number;
  messages: Message[];
  error?: string;
}

export class AgentLoop {
  private executionEngine: ExecutionEngine;
  private stateManager: RuntimeStateManager;
  private checkpointManager: CheckpointManager;
  private abortController: AbortController | null = null;

  constructor(options: AgentLoopOptions) {
    this.executionEngine = options.executionEngine;
    this.stateManager = options.stateManager;
    this.checkpointManager =
      options.checkpointManager ?? new CheckpointManager();

    if (options.maxIterations) {
      this.stateManager.setMaxIterations(options.maxIterations);
    }
  }

  async *run(
    initialMessage: string,
  ): AsyncGenerator<
    StreamChunk | { type: "iteration"; iteration: number },
    AgentLoopResult
  > {
    this.stateManager.startExecution();
    this.abortController = new AbortController();

    try {
      // Add initial user message
      this.stateManager.addMessage({
        role: "user",
        content: initialMessage,
        timestamp: Date.now(),
      });

      while (
        !this.stateManager.hasReachedMaxIterations() &&
        this.stateManager.isExecuting()
      ) {
        // Check if aborted
        if (this.abortController.signal.aborted) {
          this.stateManager.stopExecution();
          return {
            success: false,
            iterations: this.stateManager.getCurrentIteration(),
            messages: this.stateManager.getMessages() as Message[],
            error: "Execution aborted by user",
          };
        }

        // Increment iteration
        this.stateManager.incrementIteration();
        yield {
          type: "iteration" as const,
          iteration: this.stateManager.getCurrentIteration(),
        };

        // Get current messages
        const messages = this.stateManager.getMessages() as Message[];

        // Execute iteration
        const stream = this.executionEngine.execute(messages);
        let hadToolCalls = false;

        for await (const chunk of stream) {
          // Check if tool call
          if (chunk.type === "tool_use") {
            hadToolCalls = true;
          }

          // Yield chunk
          yield chunk as StreamChunk;
        }

        // Create checkpoint after tool execution
        if (hadToolCalls) {
          this.checkpointManager.save(this.stateManager.getState());
        }

        // If no tool calls, we're done
        if (!hadToolCalls) {
          this.stateManager.stopExecution();
          break;
        }
      }

      this.stateManager.stopExecution();

      return {
        success: true,
        iterations: this.stateManager.getCurrentIteration(),
        messages: this.stateManager.getMessages() as Message[],
      };
    } catch (error) {
      this.stateManager.stopExecution();
      const err = error as Error;

      return {
        success: false,
        iterations: this.stateManager.getCurrentIteration(),
        messages: this.stateManager.getMessages() as Message[],
        error: err.message,
      };
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.stateManager.stopExecution();
  }

  getState() {
    return this.stateManager.getState();
  }

  getCheckpoints() {
    return this.checkpointManager.getAll();
  }

  async rollback(checkpointId: string): Promise<boolean> {
    const state = this.checkpointManager.restore(checkpointId);
    if (state) {
      this.stateManager.setState(state);
      return true;
    }
    return false;
  }
}
