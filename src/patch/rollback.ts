/**
 * Rollback mechanism for patches
 */

import * as vscode from "vscode";
import { getLogger } from "../telemetry/logger";
import type { RollbackPoint, AppliedPatch } from "./types";

export class RollbackManager {
  private rollbackPoints: Map<string, RollbackPoint> = new Map();

  createRollbackPoint(
    patches: AppliedPatch[],
    fileBackups: Map<string, string>,
  ): string {
    const logger = getLogger();
    const id = this.generateId();

    const rollbackPoint: RollbackPoint = {
      id,
      patches,
      timestamp: Date.now(),
      fileBackups,
    };

    this.rollbackPoints.set(id, rollbackPoint);

    logger.info("Rollback point created", {
      id,
      patchCount: patches.length,
      fileCount: fileBackups.size,
    });

    return id;
  }

  async rollback(id: string): Promise<boolean> {
    const logger = getLogger();
    const rollbackPoint = this.rollbackPoints.get(id);

    if (!rollbackPoint) {
      logger.error("Rollback point not found", { id });
      return false;
    }

    try {
      for (const [filePath, backup] of rollbackPoint.fileBackups.entries()) {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(backup, "utf-8"));

        logger.debug("File restored", { file: filePath });
      }

      this.rollbackPoints.delete(id);

      logger.info("Rollback complete", {
        id,
        filesRestored: rollbackPoint.fileBackups.size,
      });

      return true;
    } catch (error) {
      logger.error("Rollback failed", {
        id,
        error: (error as Error).message,
      });
      return false;
    }
  }

  cleanup(id: string): void {
    this.rollbackPoints.delete(id);
  }

  getRollbackPoint(id: string): RollbackPoint | undefined {
    return this.rollbackPoints.get(id);
  }

  listRollbackPoints(): RollbackPoint[] {
    return Array.from(this.rollbackPoints.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  private generateId(): string {
    return `rollback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
