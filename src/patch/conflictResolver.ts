/**
 * Conflict detection and resolution for patches
 */

import * as vscode from 'vscode';
import { getLogger } from '../telemetry/logger';
import type { ConflictInfo } from './types';

export class ConflictResolver {
  async detectConflict(
    filePath: string,
    expectedContent: string
  ): Promise<ConflictInfo | null> {
    const logger = getLogger();

    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const currentContent = Buffer.from(content).toString('utf-8');

      if (currentContent === expectedContent) {
        return null;
      }

      logger.warn('Conflict detected', {
        file: filePath,
        currentLength: currentContent.length,
        expectedLength: expectedContent.length,
      });

      return {
        file: filePath,
        currentContent,
        expectedContent,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to detect conflict', {
        file: filePath,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async showConflictDiff(conflict: ConflictInfo): Promise<void> {
    const logger = getLogger();

    try {
      const currentUri = vscode.Uri.parse(
        `untitled:${conflict.file}.current`
      ).with({
        scheme: 'untitled',
        path: `${conflict.file}.current`,
      });

      const expectedUri = vscode.Uri.parse(
        `untitled:${conflict.file}.expected`
      ).with({
        scheme: 'untitled',
        path: `${conflict.file}.expected`,
      });

      await vscode.workspace.fs.writeFile(
        currentUri,
        Buffer.from(conflict.currentContent, 'utf-8')
      );
      await vscode.workspace.fs.writeFile(
        expectedUri,
        Buffer.from(conflict.expectedContent, 'utf-8')
      );

      await vscode.commands.executeCommand(
        'vscode.diff',
        currentUri,
        expectedUri,
        `Conflict: ${conflict.file}`
      );
    } catch (error) {
      logger.error('Failed to show conflict diff', error);
    }
  }

  computeSimilarity(content1: string, content2: string): number {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    const commonLines = lines1.filter((line) => lines2.includes(line)).length;
    const totalLines = Math.max(lines1.length, lines2.length);

    return totalLines > 0 ? commonLines / totalLines : 0;
  }
}
