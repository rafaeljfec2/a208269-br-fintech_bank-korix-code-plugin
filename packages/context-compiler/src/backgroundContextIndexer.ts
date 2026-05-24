import type {
  BackgroundContextIndexerOptions,
  BackgroundContextIndexerSnapshot,
  ContextCompiler,
  IndexSummary,
  WorkspaceFileInput,
} from "./types";
import { BoundedContextWorkerPool } from "./workerPool";

type IndexingCompiler = Pick<
  ContextCompiler,
  "indexWorkspace" | "updateFile" | "removeFile"
>;

export class BackgroundContextIndexer {
  private readonly workerPool: BoundedContextWorkerPool;

  constructor(
    private readonly compiler: IndexingCompiler,
    options: BackgroundContextIndexerOptions,
  ) {
    this.workerPool = new BoundedContextWorkerPool(options.workerPool);
  }

  scheduleIndexWorkspace(
    files: readonly WorkspaceFileInput[],
  ): Promise<IndexSummary> {
    return this.workerPool.enqueue(() => this.compiler.indexWorkspace(files));
  }

  scheduleUpdateFile(file: WorkspaceFileInput): Promise<IndexSummary> {
    return this.workerPool.enqueue(() => this.compiler.updateFile(file));
  }

  scheduleRemoveFile(path: string): Promise<void> {
    return this.workerPool.enqueue(() => this.compiler.removeFile(path));
  }

  snapshot(): BackgroundContextIndexerSnapshot {
    return {
      workerPool: this.workerPool.snapshot(),
    };
  }

  dispose(): void {
    this.workerPool.dispose();
  }
}
