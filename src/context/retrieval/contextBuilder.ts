/**
 * Context builder - constructs final context window from ranked files
 */

import * as vscode from "vscode";
import { getLogger } from "../../telemetry/logger";
import type { WorkspaceIndexer } from "../indexing/workspaceIndexer";
import type { HeuristicRanker } from "../ranking/heuristicRanker";
import { TokenBudget } from "../tokenBudget";
import type { ContextItem, ContextWindow } from "../types";

export interface ContextBuildOptions {
  currentFile?: string;
  userSelection?: { file: string; range: vscode.Range };
  mentionedSymbols?: string[];
  tokenBudget?: number;
}

export class ContextBuilder {
  constructor(
    _indexer: WorkspaceIndexer,
    private ranker: HeuristicRanker,
  ) {}

  async build(options: ContextBuildOptions): Promise<ContextWindow> {
    const logger = getLogger();
    const budget = new TokenBudget(options.tokenBudget ?? 180000);

    logger.info("Building context window", {
      currentFile: options.currentFile,
      hasSelection: !!options.userSelection,
      symbolCount: options.mentionedSymbols?.length ?? 0,
      budget: budget.getBudget(),
    });

    const rankedFiles = this.ranker.rankFiles({
      currentFile: options.currentFile,
      userSelection: options.userSelection,
      mentionedSymbols: options.mentionedSymbols,
    });

    const items: ContextItem[] = [];

    for (const { file, score, reasons } of rankedFiles) {
      try {
        const uri = vscode.Uri.file(file);
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();

        const tokenCount = budget.estimateTokens(content);

        if (!budget.canFit(content)) {
          logger.debug("File exceeds remaining budget, skipping", {
            file,
            tokens: tokenCount,
            remaining: budget.getRemaining(),
          });
          break;
        }

        budget.allocate(content);

        items.push({
          file,
          content,
          priority: score,
          tokenCount,
        });

        logger.debug("Added file to context", {
          file,
          score,
          reasons: reasons.join(", "),
          tokens: tokenCount,
        });
      } catch (error) {
        logger.warn("Failed to read file for context", {
          file,
          error: (error as Error).message,
        });
      }
    }

    budget.logStatus();

    const contextWindow: ContextWindow = {
      items,
      totalTokens: budget.getUsed(),
      budget: budget.getBudget(),
    };

    logger.info("Context window built", {
      fileCount: items.length,
      totalTokens: contextWindow.totalTokens,
      utilization: `${budget.getUtilization().toFixed(1)}%`,
    });

    return contextWindow;
  }

  formatForProvider(contextWindow: ContextWindow): string {
    const parts: string[] = [];

    parts.push("# Workspace Context\n");

    for (const item of contextWindow.items) {
      parts.push(`\n## File: ${item.file}\n`);
      parts.push("```\n");
      parts.push(item.content);
      parts.push("\n```\n");
    }

    parts.push(`\n# Context Statistics\n`);
    parts.push(`- Files included: ${contextWindow.items.length}\n`);
    parts.push(`- Total tokens: ${contextWindow.totalTokens}\n`);
    parts.push(
      `- Budget utilization: ${((contextWindow.totalTokens / contextWindow.budget) * 100).toFixed(1)}%\n`,
    );

    return parts.join("");
  }
}
