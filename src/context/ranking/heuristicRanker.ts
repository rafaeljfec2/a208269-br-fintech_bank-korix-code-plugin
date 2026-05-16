/**
 * Heuristic-based file ranking for context retrieval
 */

import * as vscode from 'vscode';
import { getLogger } from '../../telemetry/logger';
import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';
import type { RankingScore, HeuristicWeights } from '../types';

export class HeuristicRanker {
  private weights: HeuristicWeights = {
    currentFile: 10.0,
    userSelection: 9.0,
    directImports: 7.0,
    gitDiff: 6.0,
    openTabs: 5.0,
    relatedSymbols: 4.0,
    recentlyModified: 3.0,
  };

  constructor(private indexer: WorkspaceIndexer) {}

  async rankFiles(context: {
    currentFile?: string;
    userSelection?: { file: string; range: vscode.Range };
    mentionedSymbols?: string[];
  }): Promise<RankingScore[]> {
    const logger = getLogger();
    const scores = new Map<string, { score: number; reasons: string[] }>();

    const allFiles = this.indexer.getAllFiles();

    for (const file of allFiles) {
      scores.set(file.path, { score: 0, reasons: [] });
    }

    if (context.currentFile) {
      this.scoreCurrentFile(scores, context.currentFile);
    }

    if (context.userSelection) {
      this.scoreUserSelection(scores, context.userSelection.file);
    }

    if (context.currentFile) {
      await this.scoreDirectImports(scores, context.currentFile);
    }

    await this.scoreGitDiff(scores);
    await this.scoreOpenTabs(scores);

    if (context.mentionedSymbols && context.mentionedSymbols.length > 0) {
      this.scoreRelatedSymbols(scores, context.mentionedSymbols);
    }

    this.scoreRecentlyModified(scores);

    const results = Array.from(scores.entries())
      .map(([file, { score, reasons }]) => ({ file, score, reasons }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    logger.debug('Ranked files', {
      total: results.length,
      top5: results.slice(0, 5).map((r) => ({ file: r.file, score: r.score })),
    });

    return results;
  }

  private scoreCurrentFile(scores: Map<string, { score: number; reasons: string[] }>, file: string): void {
    const entry = scores.get(file);
    if (entry) {
      entry.score += this.weights.currentFile;
      entry.reasons.push('current file');
    }
  }

  private scoreUserSelection(scores: Map<string, { score: number; reasons: string[] }>, file: string): void {
    const entry = scores.get(file);
    if (entry) {
      entry.score += this.weights.userSelection;
      entry.reasons.push('user selection');
    }
  }

  private async scoreDirectImports(scores: Map<string, { score: number; reasons: string[] }>, file: string): Promise<void> {
    const imports = this.indexer.getImports(file);

    if (imports.length === 0) {
      return;
    }

    for (const imp of imports) {
      if (imp.isExternal) {
        continue;
      }

      let resolvedPath = imp.target;
      if (resolvedPath.startsWith('.')) {
        const path = require('path');
        const dir = path.dirname(file);
        resolvedPath = path.resolve(dir, imp.target);
      }

      for (const [filePath, entry] of scores.entries()) {
        if (filePath.includes(resolvedPath) || resolvedPath.includes(filePath)) {
          entry.score += this.weights.directImports;
          entry.reasons.push('direct import');
          break;
        }
      }
    }
  }

  private async scoreGitDiff(scores: Map<string, { score: number; reasons: string[] }>): Promise<void> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        return;
      }

      const git = gitExtension.exports.getAPI(1);
      const repo = git.repositories[0];

      if (!repo) {
        return;
      }

      const changes = repo.state.workingTreeChanges;

      for (const change of changes) {
        const entry = scores.get(change.uri.fsPath);
        if (entry) {
          entry.score += this.weights.gitDiff;
          entry.reasons.push('git diff');
        }
      }
    } catch (error) {
      // Git not available, skip
    }
  }

  private async scoreOpenTabs(scores: Map<string, { score: number; reasons: string[] }>): Promise<void> {
    const openEditors = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .map((tab) => tab.input)
      .filter((input): input is vscode.TabInputText => input instanceof vscode.TabInputText)
      .map((input) => input.uri.fsPath);

    for (const file of openEditors) {
      const entry = scores.get(file);
      if (entry) {
        entry.score += this.weights.openTabs;
        entry.reasons.push('open tab');
      }
    }
  }

  private scoreRelatedSymbols(scores: Map<string, { score: number; reasons: string[] }>, symbols: string[]): void {
    for (const symbolName of symbols) {
      const symbol = this.indexer.findSymbol(symbolName);
      if (symbol) {
        const entry = scores.get(symbol.location.file);
        if (entry) {
          entry.score += this.weights.relatedSymbols;
          entry.reasons.push(`symbol: ${symbolName}`);
        }
      }
    }
  }

  private scoreRecentlyModified(scores: Map<string, { score: number; reasons: string[] }>): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [file, entry] of scores.entries()) {
      const fileInfo = this.indexer.getFile(file);
      if (fileInfo && now - fileInfo.lastModified < oneHour) {
        entry.score += this.weights.recentlyModified;
        entry.reasons.push('recently modified');
      }
    }
  }

  setWeights(weights: Partial<HeuristicWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  getWeights(): HeuristicWeights {
    return { ...this.weights };
  }
}
