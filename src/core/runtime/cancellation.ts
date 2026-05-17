/**
 * Cancellation manager - AbortController wrapper
 */

import type { Logger } from "../../telemetry/logger";
import { RuntimeEventEmitter } from "./runtimeEvents";

export class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancellationError";
  }
}

export class CancellationManager {
  private abortController: AbortController;
  private cancellationCallbacks: Array<() => void | Promise<void>> = [];

  constructor(
    private readonly logger: Logger,
    private readonly eventEmitter: RuntimeEventEmitter,
  ) {
    this.abortController = new AbortController();
  }

  getSignal(): AbortSignal {
    return this.abortController.signal;
  }

  registerCleanup(callback: () => void | Promise<void>): void {
    this.cancellationCallbacks.push(callback);
  }

  async cancel(reason: string, currentIteration: number): Promise<void> {
    this.logger.info("Cancelling execution", {
      reason,
      iteration: currentIteration,
    });
    this.abortController.abort();

    for (const callback of this.cancellationCallbacks) {
      try {
        await callback();
      } catch (error) {
        this.logger.error("Cleanup callback failed", error);
      }
    }

    this.eventEmitter.emitEvent({
      type: "cancelled",
      reason,
      iteration: currentIteration,
      timestamp: Date.now(),
    });
  }

  checkCancellation(): void {
    if (this.abortController.signal.aborted) {
      throw new CancellationError("Execution was cancelled");
    }
  }

  reset(): void {
    this.abortController = new AbortController();
    this.cancellationCallbacks = [];
  }
}
