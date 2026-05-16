/**
 * Checkpoint management for rollback and recovery
 */

import type { Checkpoint, RuntimeState } from "../types";

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private maxCheckpoints = 10;

  save(state: RuntimeState, filesModified: string[] = []): Checkpoint {
    const checkpoint: Checkpoint = {
      id: this.generateCheckpointId(),
      timestamp: Date.now(),
      state: {
        session: { ...state.session },
        context: { ...state.context },
        isExecuting: state.isExecuting,
        currentIteration: state.currentIteration,
        maxIterations: state.maxIterations,
      },
      filesModified,
    };

    this.checkpoints.push(checkpoint);

    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift();
    }

    return checkpoint;
  }

  restore(checkpointId: string): Partial<RuntimeState> | null {
    const checkpoint = this.checkpoints.find((cp) => cp.id === checkpointId);
    return checkpoint ? checkpoint.state : null;
  }

  getLatest(): Checkpoint | null {
    return this.checkpoints[this.checkpoints.length - 1] ?? null;
  }

  getAll(): readonly Checkpoint[] {
    return [...this.checkpoints];
  }

  clear(): void {
    this.checkpoints = [];
  }

  count(): number {
    return this.checkpoints.length;
  }

  private generateCheckpointId(): string {
    return `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
