/**
 * Patch validation - pre and post application checks
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from '../telemetry/logger';
import type { Patch, ValidationResult } from './types';

export class PatchValidator {
  constructor(private workspaceRoot: string) {}

  async validateBeforeApply(patch: Patch): Promise<ValidationResult> {
    const logger = getLogger();
    const errors: string[] = [];
    const warnings: string[] = [];

    const absolutePath = path.isAbsolute(patch.file)
      ? patch.file
      : path.join(this.workspaceRoot, patch.file);

    try {
      const uri = vscode.Uri.file(absolutePath);
      await vscode.workspace.fs.stat(uri);
    } catch {
      errors.push(`File not found: ${patch.file}`);
      return { valid: false, errors, warnings };
    }

    try {
      const uri = vscode.Uri.file(absolutePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      const searchCount = this.countOccurrences(text, patch.search);

      if (searchCount === 0) {
        errors.push(`SEARCH block not found in ${patch.file}`);
      } else if (searchCount > 1) {
        errors.push(
          `SEARCH block appears ${searchCount} times in ${patch.file} - must be unique`
        );
      }

      if (patch.search.length > 10000) {
        warnings.push('Very large SEARCH block - may be slow to apply');
      }

      logger.debug('Validation complete', {
        file: patch.file,
        searchCount,
        valid: errors.length === 0,
      });
    } catch (error) {
      errors.push(`Failed to read file: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async validateAfterApply(
    patch: Patch,
    filePath: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      const replaceCount = this.countOccurrences(text, patch.replace);

      if (replaceCount === 0) {
        errors.push('REPLACE block not found in file after applying patch');
      }

      const searchCount = this.countOccurrences(text, patch.search);
      if (searchCount > 0) {
        errors.push('SEARCH block still exists in file after applying patch');
      }
    } catch (error) {
      errors.push(`Post-validation failed: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private countOccurrences(text: string, search: string): number {
    if (!search) {
      return 0;
    }

    let count = 0;
    let pos = 0;

    while ((pos = text.indexOf(search, pos)) !== -1) {
      count++;
      pos += search.length;
    }

    return count;
  }

  async checkForConflicts(
    filePath: string,
    expectedContent: string
  ): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const currentContent = Buffer.from(content).toString('utf-8');

      return currentContent !== expectedContent;
    } catch {
      return true;
    }
  }
}
