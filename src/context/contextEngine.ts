/**
 * Context Engine - orchestrates indexing, ranking, and context building
 */

import { getLogger } from "../telemetry/logger";
import { WorkspaceIndexer } from "./indexing/workspaceIndexer";
import { HeuristicRanker } from "./ranking/heuristicRanker";
import {
  ContextBuilder,
  type ContextBuildOptions,
} from "./retrieval/contextBuilder";
import {
  buildWorkspaceGraphFromIndex,
  contextWindowToCompilerRequest,
  contextWindowToIr,
  formatContextWindow,
  type LegacyContextIrOptions,
} from "./contextCompilerAdapter";
import type { ContextWindow } from "./types";
import type {
  ContextCompiler,
  ContextCompilerOptions,
  ContextIR,
  WorkspaceFileInput,
  WorkspaceGraph,
} from "@korix/context-compiler";
import {
  BackgroundContextIndexer,
  createContextCompiler,
  formatContextIrForProvider,
} from "@korix/context-compiler";

export class ContextEngine {
  private readonly indexer: WorkspaceIndexer;
  private readonly ranker: HeuristicRanker;
  private readonly builder: ContextBuilder;
  private readonly compiler: ContextCompiler;
  private readonly backgroundIndexer: BackgroundContextIndexer;
  private readonly compilerOptions: ContextCompilerOptions;
  private readonly initialWorkspaceRoot?: string;
  private initialized = false;
  private initializePromise?: Promise<void>;
  private compilerRoot?: string;

  constructor(
    compiler?: ContextCompiler,
    compilerOptions: ContextCompilerOptions = {},
    initialWorkspaceRoot?: string,
  ) {
    this.indexer = new WorkspaceIndexer({
      onFileIndexed: (file) => this.scheduleCompilerFileUpdate(file),
      onFileDeleted: (path) => this.scheduleCompilerFileRemoval(path),
    });
    this.ranker = new HeuristicRanker(this.indexer);
    this.builder = new ContextBuilder(this.indexer, this.ranker);
    this.compiler =
      compiler ?? createContextCompiler(undefined, compilerOptions);
    this.backgroundIndexer = new BackgroundContextIndexer(this.compiler, {
      workerPool: {
        concurrency: 1,
        maxQueuedTasks: 4,
      },
    });
    this.compilerOptions = compilerOptions;
    this.initialWorkspaceRoot = initialWorkspaceRoot;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initializePromise ??= this.initializeOnce();
    await this.initializePromise;
  }

  private async initializeOnce(): Promise<void> {
    const logger = this.getOptionalLogger();
    logger?.info("Initializing Context Engine");

    try {
      await this.indexer.initialize();
      await this.warmCompiler();
      this.initialized = true;
      logger?.info("Context Engine initialized successfully");
    } catch (error) {
      this.initializePromise = undefined;
      throw error;
    }
  }

  async buildContext(options: ContextBuildOptions): Promise<ContextWindow> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.builder.build(options);
  }

  async buildContextIr(
    options: ContextBuildOptions & LegacyContextIrOptions,
  ): Promise<ContextIR> {
    const contextWindow = await this.buildContext(options);
    const compilerOptions = {
      ...options,
      activeFile: options.activeFile ?? options.currentFile,
    };
    const request = contextWindowToCompilerRequest(
      contextWindow,
      compilerOptions,
    );

    try {
      const workspaceRoot = this.resolveWorkspaceRoot(request.workspaceRoot);
      if (workspaceRoot !== undefined) {
        await this.ensureCompilerInitialized(workspaceRoot);
      }
      await this.backgroundIndexer.scheduleIndexWorkspace(request.files);
      return await this.compiler.buildContextIr(request);
    } catch (error) {
      this.warnCompilerFailure(error);
      return contextWindowToIr(contextWindow, compilerOptions);
    }
  }

  formatContext(contextWindow: ContextWindow): string {
    return formatContextWindow(contextWindow);
  }

  formatContextIr(contextIr: ContextIR): string {
    return formatContextIrForProvider(contextIr);
  }

  async getWorkspaceGraph(options: {
    readonly rootFile?: string;
    readonly maxDepth?: number;
  }): Promise<WorkspaceGraph> {
    if (!this.initialized) {
      await this.initialize();
    }

    return buildWorkspaceGraphFromIndex({
      files: this.indexer.getAllFiles().map((file) => file.path),
      imports: this.indexer.getAllImports(),
      symbolsByFile: this.indexer.getSymbolsByFile(),
      rootFile: options.rootFile,
      maxDepth: options.maxDepth,
    });
  }

  dispose(): void {
    try {
      const logger = getLogger();
      logger.info("Disposing Context Engine");
    } catch {
      // Telemetry may be unavailable in isolated unit tests.
    }

    this.indexer.dispose();
    this.backgroundIndexer.dispose();
    this.compiler.dispose();
  }

  private async ensureCompilerInitialized(
    workspaceRoot: string,
  ): Promise<void> {
    if (this.compilerRoot === workspaceRoot) {
      return;
    }

    if (this.compilerOptions.cacheDatabasePath !== undefined) {
      await this.compiler.initialize(workspaceRoot, this.compilerOptions);
    } else {
      await this.compiler.initialize(workspaceRoot);
    }
    this.compilerRoot = workspaceRoot;
  }

  private async warmCompiler(): Promise<void> {
    if (this.initialWorkspaceRoot === undefined) {
      return;
    }

    try {
      await this.ensureCompilerInitialized(this.initialWorkspaceRoot);
    } catch (error) {
      this.warnCompilerFailure(error);
    }
  }

  private resolveWorkspaceRoot(workspaceRoot: string): string | undefined {
    if (workspaceRoot.length > 0) {
      return workspaceRoot;
    }

    return this.initialWorkspaceRoot;
  }

  private warnCompilerFailure(error: unknown): void {
    this.getOptionalLogger()?.warn(
      "Context compiler failed, using legacy ContextIR adapter",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  private scheduleCompilerFileUpdate(file: WorkspaceFileInput): void {
    const workspaceRoot = this.compilerRoot ?? this.initialWorkspaceRoot;
    if (workspaceRoot === undefined) {
      return;
    }

    void this.ensureCompilerInitialized(workspaceRoot)
      .then(() => this.backgroundIndexer.scheduleUpdateFile(file))
      .catch((error: unknown) => this.warnCompilerFailure(error));
  }

  private scheduleCompilerFileRemoval(path: string): void {
    const workspaceRoot = this.compilerRoot ?? this.initialWorkspaceRoot;
    if (workspaceRoot === undefined) {
      return;
    }

    void this.ensureCompilerInitialized(workspaceRoot)
      .then(() => this.backgroundIndexer.scheduleRemoveFile(path))
      .catch((error: unknown) => this.warnCompilerFailure(error));
  }

  private getOptionalLogger(): ReturnType<typeof getLogger> | undefined {
    try {
      return getLogger();
    } catch {
      // Telemetry may be unavailable in isolated unit tests.
      return undefined;
    }
  }
}

const globalContextEngineState: {
  current: ContextEngine | null;
} = {
  current: null,
};

export const globalContextEngine = globalContextEngineState;

export function initializeContextEngine(): ContextEngine {
  globalContextEngineState.current = new ContextEngine();
  return globalContextEngineState.current;
}

export function getContextEngine(): ContextEngine {
  if (!globalContextEngineState.current) {
    throw new Error("Context Engine not initialized");
  }
  return globalContextEngineState.current;
}
