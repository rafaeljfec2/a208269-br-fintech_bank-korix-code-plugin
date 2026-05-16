/**
 * Context Engine - orchestrates indexing, ranking, and context building
 */

import { getLogger } from '../telemetry/logger';
import { WorkspaceIndexer } from './indexing/workspaceIndexer';
import { HeuristicRanker } from './ranking/heuristicRanker';
import { ContextBuilder, type ContextBuildOptions } from './retrieval/contextBuilder';
import type { ContextWindow } from './types';

export class ContextEngine {
  private indexer: WorkspaceIndexer;
  private ranker: HeuristicRanker;
  private builder: ContextBuilder;
  private initialized = false;

  constructor() {
    this.indexer = new WorkspaceIndexer();
    this.ranker = new HeuristicRanker(this.indexer);
    this.builder = new ContextBuilder(this.indexer, this.ranker);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const logger = getLogger();
    logger.info('Initializing Context Engine');

    await this.indexer.initialize();
    this.initialized = true;

    logger.info('Context Engine initialized successfully');
  }

  async buildContext(options: ContextBuildOptions): Promise<ContextWindow> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.builder.build(options);
  }

  formatContext(contextWindow: ContextWindow): string {
    return this.builder.formatForProvider(contextWindow);
  }

  dispose(): void {
    const logger = getLogger();
    logger.info('Disposing Context Engine');
    this.indexer.dispose();
  }
}

export let globalContextEngine: ContextEngine | null = null;

export function initializeContextEngine(): ContextEngine {
  globalContextEngine = new ContextEngine();
  return globalContextEngine;
}

export function getContextEngine(): ContextEngine {
  if (!globalContextEngine) {
    throw new Error('Context Engine not initialized');
  }
  return globalContextEngine;
}
