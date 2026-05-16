/**
 * Patch applier - atomic application of patches with rollback
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from '../telemetry/logger';
import { PatchParser } from './parser';
import { PatchValidator } from './validation';
import { RollbackManager } from './rollback';
import type {
  Patch,
  PatchResult,
  AppliedPatch,
  PatchError,
} from './types';
import { PatchErrorReason } from './types';

export class PatchApplier {
  private parser: PatchParser;
  private validator: PatchValidator;
  private rollbackManager: RollbackManager;

  constructor(private workspaceRoot: string) {
    this.parser = new PatchParser();
    this.validator = new PatchValidator(workspaceRoot);
    this.rollbackManager = new RollbackManager();
  }

  async applyPatches(content: string): Promise<PatchResult> {
    const logger = getLogger();
    const startTime = Date.now();

    logger.info('Starting patch application');

    const { patches, errors } = this.parser.parse(content);

    if (patches.length === 0) {
      return {
        success: false,
        appliedPatches: [],
        errors,
      };
    }

    const fileBackups = new Map<string, string>();
    const appliedPatches: AppliedPatch[] = [];
    const allErrors: PatchError[] = [...errors];

    for (const patch of patches) {
      const validation = this.parser.validate(patch);
      if (!validation.valid) {
        allErrors.push({
          file: patch.file,
          error: validation.errors.join(', '),
          reason: PatchErrorReason.VALIDATION_ERROR,
        });
        continue;
      }

      const preValidation = await this.validator.validateBeforeApply(patch);
      if (!preValidation.valid) {
        allErrors.push({
          file: patch.file,
          error: preValidation.errors.join(', '),
          reason: PatchErrorReason.VALIDATION_ERROR,
        });
        continue;
      }

      const absolutePath = path.isAbsolute(patch.file)
        ? patch.file
        : path.join(this.workspaceRoot, patch.file);

      if (!fileBackups.has(absolutePath)) {
        const backup = await this.backupFile(absolutePath);
        if (backup) {
          fileBackups.set(absolutePath, backup);
        }
      }

      const result = await this.applySinglePatch(patch, absolutePath);

      if (result.success && result.applied) {
        appliedPatches.push(result.applied);
      } else if (result.error) {
        allErrors.push(result.error);
      }
    }

    const rollbackId = await this.rollbackManager.createRollbackPoint(
      appliedPatches,
      fileBackups
    );

    const duration = Date.now() - startTime;

    logger.info('Patch application complete', {
      applied: appliedPatches.length,
      errors: allErrors.length,
      duration,
      rollbackId,
    });

    return {
      success: allErrors.length === 0 && appliedPatches.length > 0,
      appliedPatches,
      errors: allErrors,
    };
  }

  private async applySinglePatch(
    patch: Patch,
    filePath: string
  ): Promise<{
    success: boolean;
    applied?: AppliedPatch;
    error?: PatchError;
  }> {
    const logger = getLogger();

    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      const searchIndex = text.indexOf(patch.search);

      if (searchIndex === -1) {
        return {
          success: false,
          error: {
            file: patch.file,
            error: 'SEARCH block not found',
            reason: PatchErrorReason.SEARCH_NOT_FOUND,
          },
        };
      }

      const newText =
        text.substring(0, searchIndex) +
        patch.replace +
        text.substring(searchIndex + patch.search.length);

      await vscode.workspace.fs.writeFile(uri, Buffer.from(newText, 'utf-8'));

      const lineNumber = text.substring(0, searchIndex).split('\n').length;

      const postValidation = await this.validator.validateAfterApply(
        patch,
        filePath
      );

      if (!postValidation.valid) {
        logger.warn('Post-validation failed', {
          file: patch.file,
          errors: postValidation.errors,
        });
      }

      logger.debug('Patch applied', {
        file: patch.file,
        line: lineNumber,
      });

      return {
        success: true,
        applied: {
          file: patch.file,
          search: patch.search,
          replace: patch.replace,
          lineNumber,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          file: patch.file,
          error: (error as Error).message,
          reason: PatchErrorReason.WRITE_ERROR,
        },
      };
    }
  }

  private async backupFile(filePath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf-8');
    } catch {
      return null;
    }
  }

  async rollback(rollbackId: string): Promise<boolean> {
    return this.rollbackManager.rollback(rollbackId);
  }

  getRollbackManager(): RollbackManager {
    return this.rollbackManager;
  }
}
