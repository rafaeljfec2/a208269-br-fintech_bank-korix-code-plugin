/**
 * Checkpoint manager - incremental file snapshots
 */

import * as crypto from 'crypto';
import fs from 'fs/promises';
import type { Logger } from '../../telemetry/logger';
import type { RuntimeState } from './runtimeState';
import type { RuntimeCheckpoint, FileSnapshot } from './runtimeTypes';

export class CheckpointManager {
  private checkpoints = new Map<string, RuntimeCheckpoint>();
  private readonly maxCheckpoints = 10;

  constructor(private readonly logger: Logger) {}

  async create(state: RuntimeState, modifiedFiles: Set<string>): Promise<string> {
    const checkpointId = `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    // Snapshot modified files
    const fileSnapshots: FileSnapshot[] = [];
    for (const filePath of modifiedFiles) {
      try {
        const contentStr = await fs.readFile(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(contentStr).digest('hex');

        fileSnapshots.push({
          path: filePath,
          content: contentStr,
          hash,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.logger.error(`Failed to snapshot file ${filePath}`, error as Error);
        throw error; // Re-throw to fail checkpoint creation
      }
    }

    const conversation = state.getConversation();
    const execution = state.getExecution();
    const memory = state.getMemory();

    const checkpoint: RuntimeCheckpoint = {
      id: checkpointId,
      iteration: execution.currentIteration,
      timestamp: Date.now(),
      modifiedFiles: fileSnapshots,
      operationJournal: conversation.toolCallHistory.map((tc) => ({
        type: 'tool_call' as const,
        toolName: tc.toolName,
        toolInput: tc.input,
        timestamp: tc.timestamp,
        success: tc.success,
      })),
      memoryState: memory,
      conversationSnapshot: conversation.messages,
    };

    this.checkpoints.set(checkpointId, checkpoint);
    this.evictOldCheckpoints();

    return checkpointId;
  }

  async restore(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // Restore files
    for (const snapshot of checkpoint.modifiedFiles) {
      try {
        await fs.writeFile(snapshot.path, snapshot.content, 'utf-8');
      } catch (error) {
        this.logger.error(`Failed to restore file ${snapshot.path}`, error as Error);
        throw error; // Re-throw to fail restore
      }
    }
  }

  get(checkpointId: string): RuntimeCheckpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  getLatest(): RuntimeCheckpoint | undefined {
    const checkpoints = Array.from(this.checkpoints.values());
    return checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  private evictOldCheckpoints(): void {
    if (this.checkpoints.size <= this.maxCheckpoints) {
      return;
    }

    const sorted = Array.from(this.checkpoints.entries()).sort(
      ([, a], [, b]) => b.timestamp - a.timestamp,
    );

    for (let i = this.maxCheckpoints; i < sorted.length; i++) {
      const [id] = sorted[i]!;
      this.checkpoints.delete(id);
    }
  }
}
