import type {
  ContextWorkerPoolOptions,
  ContextWorkerPoolSnapshot,
  ContextWorkerTask,
} from "./types";

interface WorkerQueueItem {
  readonly run: () => void;
  readonly reject: (error: unknown) => void;
}

type TaskOutcome<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: unknown;
    };

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function nonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export class BoundedContextWorkerPool {
  private readonly concurrency: number;
  private readonly maxQueuedTasks: number;
  private readonly queue: WorkerQueueItem[] = [];
  private runningTasks = 0;
  private acceptedTasks = 0;
  private rejectedTasks = 0;
  private completedTasks = 0;
  private failedTasks = 0;
  private disposed = false;

  constructor(options: ContextWorkerPoolOptions) {
    this.concurrency = positiveInteger(options.concurrency, 1);
    this.maxQueuedTasks = nonNegativeInteger(options.maxQueuedTasks);
  }

  enqueue<T>(task: ContextWorkerTask<T>): Promise<T> {
    if (this.disposed) {
      this.rejectedTasks += 1;
      return Promise.reject(new Error("Context worker pool is disposed"));
    }

    if (
      this.runningTasks >= this.concurrency &&
      this.queue.length >= this.maxQueuedTasks
    ) {
      this.rejectedTasks += 1;
      return Promise.reject(new Error("Context worker pool queue is full"));
    }

    this.acceptedTasks += 1;

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: () => this.runTask(task, resolve, reject),
        reject,
      });
      this.drain();
    });
  }

  snapshot(): ContextWorkerPoolSnapshot {
    return {
      runningTasks: this.runningTasks,
      queuedTasks: this.queue.length,
      acceptedTasks: this.acceptedTasks,
      rejectedTasks: this.rejectedTasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.rejectedTasks += 1;
      item?.reject(new Error("Context worker pool is disposed"));
    }
  }

  private drain(): void {
    while (this.runningTasks < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item !== undefined) {
        item.run();
      }
    }
  }

  private runTask<T>(
    task: ContextWorkerTask<T>,
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ): void {
    this.runningTasks += 1;
    void this.runTaskAsync(task, resolve, reject);
  }

  private async runTaskAsync<T>(
    task: ContextWorkerTask<T>,
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ): Promise<void> {
    const outcome = await this.executeTask(task);
    if (outcome.ok) {
      this.completedTasks += 1;
    } else {
      this.failedTasks += 1;
    }

    this.runningTasks -= 1;
    this.drain();

    if (outcome.ok) {
      resolve(outcome.value);
      return;
    }

    reject(outcome.error);
  }

  private async executeTask<T>(
    task: ContextWorkerTask<T>,
  ): Promise<TaskOutcome<T>> {
    try {
      return {
        ok: true,
        value: await task(),
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error,
      };
    }
  }
}
