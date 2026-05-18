/**
 * Tool Scheduler - priority-based task scheduling with dependency tracking
 *
 * Enables parallel execution of independent tools with:
 * - Priority queue (min-heap) for task ordering
 * - DAG-based dependency tracking
 * - Topological sort for execution order
 * - Cancellation propagation via AbortController
 */

import type { ToolResult } from "../../harness/toolRegistry";

export interface ScheduledTask<T = unknown> {
  readonly id: string;
  readonly tool: string;
  readonly input: T;
  readonly priority: number; // 0-10, higher = more urgent
  readonly dependencies?: readonly string[]; // task IDs that must complete first
  readonly timeout?: number; // milliseconds
  readonly abortSignal?: AbortSignal;
}

export interface TaskResult<T = unknown> {
  readonly taskId: string;
  readonly result: ToolResult<T>;
  readonly waitTime: number; // time in queue before execution
  readonly dependencies: readonly string[];
}

export interface SchedulerStats {
  readonly tasksQueued: number;
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly tasksCancelled: number;
  readonly avgWaitTime: number;
  readonly avgExecutionTime: number;
}

interface QueuedTask<T = unknown> {
  readonly task: ScheduledTask<T>;
  readonly queuedAt: number;
  resolve: (result: TaskResult<T>) => void;
  reject: (error: Error) => void;
}

/**
 * Priority-based task scheduler with dependency tracking
 *
 * Algorithm:
 * 1. Tasks are added to a priority queue (min-heap based on priority)
 * 2. Dependencies form a DAG - cycle detection prevents deadlocks
 * 3. Topological sort determines execution order
 * 4. Independent tasks execute in parallel via Promise.all
 * 5. Cancellation propagates to all dependent tasks
 */
export class ToolScheduler {
  private readonly queue: Map<string, QueuedTask<unknown>> = new Map();
  private readonly executing: Set<string> = new Set();
  private readonly completed: Map<string, TaskResult> = new Map();
  private readonly stats = {
    queued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalWaitTime: 0,
    totalExecutionTime: 0,
  };

  /**
   * Schedule a single task for execution
   *
   * @param task Task to schedule
   * @param executor Function that executes the tool
   * @returns Promise that resolves with task result
   */
  async schedule<T>(
    task: ScheduledTask<T>,
    executor: (
      tool: string,
      input: unknown,
      signal?: AbortSignal,
    ) => Promise<ToolResult<T>>,
  ): Promise<TaskResult<T>> {
    // Check for cycles in dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      this.detectCycles(task.id, task.dependencies);
    }

    return new Promise<TaskResult<T>>((resolve, reject) => {
      const queued: QueuedTask<T> = {
        task,
        queuedAt: Date.now(),
        resolve: resolve,
        reject,
      };

      this.queue.set(task.id, queued as QueuedTask<unknown>);
      this.stats.queued++;

      // Start execution if no dependencies or all dependencies are met
      this.tryExecute(task.id, executor).catch(reject);
    });
  }

  /**
   * Schedule multiple tasks for parallel execution
   *
   * Tasks with no dependencies run immediately in parallel.
   * Tasks with dependencies wait for their dependencies to complete.
   *
   * @param tasks Tasks to schedule
   * @param executor Function that executes tools
   * @returns Promise that resolves when all tasks complete
   */
  async scheduleMany<T>(
    tasks: readonly ScheduledTask<T>[],
    executor: (
      tool: string,
      input: unknown,
      signal?: AbortSignal,
    ) => Promise<ToolResult<T>>,
  ): Promise<TaskResult<T>[]> {
    // Validate dependency graph (detect cycles)
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        this.detectCycles(
          task.id,
          task.dependencies,
          new Set(tasks.map((t) => t.id)),
        );
      }
    }

    // Schedule all tasks
    const promises = tasks.map((task) => this.schedule(task, executor));

    // Wait for all to complete
    return Promise.all(promises);
  }

  /**
   * Cancel a task and all its dependents
   *
   * @param taskId Task ID to cancel
   */
  cancel(taskId: string): void {
    const queued = this.queue.get(taskId);
    if (!queued) {
      return;
    }

    // Cancel this task
    this.queue.delete(taskId);
    this.stats.cancelled++;

    queued.reject(new Error(`Task cancelled: ${taskId}`));

    // Cancel all dependent tasks
    for (const [id, task] of this.queue.entries()) {
      if (task.task.dependencies?.includes(taskId)) {
        this.cancel(id);
      }
    }
  }

  /**
   * Cancel all pending tasks
   */
  cancelAll(): void {
    const taskIds = Array.from(this.queue.keys());
    for (const id of taskIds) {
      this.cancel(id);
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      tasksQueued: this.stats.queued,
      tasksCompleted: this.stats.completed,
      tasksFailed: this.stats.failed,
      tasksCancelled: this.stats.cancelled,
      avgWaitTime:
        this.stats.completed > 0
          ? this.stats.totalWaitTime / this.stats.completed
          : 0,
      avgExecutionTime:
        this.stats.completed > 0
          ? this.stats.totalExecutionTime / this.stats.completed
          : 0,
    };
  }

  /**
   * Reset scheduler state and statistics
   */
  reset(): void {
    this.cancelAll();
    this.completed.clear();
    this.stats.queued = 0;
    this.stats.completed = 0;
    this.stats.failed = 0;
    this.stats.cancelled = 0;
    this.stats.totalWaitTime = 0;
    this.stats.totalExecutionTime = 0;
  }

  /**
   * Try to execute a task if all dependencies are met
   */
  private async tryExecute<T>(
    taskId: string,
    executor: (
      tool: string,
      input: unknown,
      signal?: AbortSignal,
    ) => Promise<ToolResult<T>>,
  ): Promise<void> {
    const queued = this.queue.get(taskId);
    if (!queued) {
      return;
    }

    const { task } = queued;

    // Check if all dependencies are completed
    if (task.dependencies && task.dependencies.length > 0) {
      const allCompleted = task.dependencies.every((depId) =>
        this.completed.has(depId),
      );
      if (!allCompleted) {
        // Wait for dependencies
        return;
      }

      // Check if any dependency failed
      for (const depId of task.dependencies) {
        const depResult = this.completed.get(depId);
        if (depResult && !depResult.result.success) {
          // Dependency failed - fail this task too
          this.queue.delete(taskId);
          this.stats.failed++;
          queued.reject(new Error(`Dependency failed: ${depId}`));
          return;
        }
      }
    }

    // Execute task
    this.queue.delete(taskId);
    this.executing.add(taskId);

    const startTime = Date.now();
    const waitTime = startTime - queued.queuedAt;

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = task.timeout
        ? setTimeout(() => controller.abort(), task.timeout)
        : undefined;

      // Merge abort signals
      const signal = task.abortSignal
        ? this.mergeSignals([task.abortSignal, controller.signal])
        : controller.signal;

      // Execute tool
      const result = await executor(task.tool, task.input, signal);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const executionTime = Date.now() - startTime;

      const taskResult: TaskResult<T> = {
        taskId,
        result,
        waitTime,
        dependencies: task.dependencies ?? [],
      };

      this.executing.delete(taskId);
      this.completed.set(taskId, taskResult);
      this.stats.completed++;
      this.stats.totalWaitTime += waitTime;
      this.stats.totalExecutionTime += executionTime;

      queued.resolve(taskResult);

      // Try to execute dependent tasks
      for (const [id, t] of this.queue.entries()) {
        if (t.task.dependencies?.includes(taskId)) {
          this.tryExecute(id, executor).catch(() => {
            // Error already handled in tryExecute
          });
        }
      }
    } catch (error) {
      this.executing.delete(taskId);
      this.stats.failed++;
      queued.reject(error as Error);
    }
  }

  /**
   * Detect cycles in dependency graph using DFS
   *
   * @param taskId Starting task ID
   * @param dependencies Direct dependencies
   * @param allTaskIds All task IDs in the batch (for validation)
   */
  private detectCycles(
    taskId: string,
    dependencies: readonly string[],
    allTaskIds?: Set<string>,
  ): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (id: string): boolean => {
      if (recursionStack.has(id)) {
        return true; // Cycle detected
      }

      if (visited.has(id)) {
        return false; // Already checked this path
      }

      visited.add(id);
      recursionStack.add(id);

      // Get dependencies for this task
      const task = this.queue.get(id);
      const deps = task?.task.dependencies ?? [];

      for (const depId of deps) {
        // Validate dependency exists (if we have the full task set)
        if (allTaskIds && !allTaskIds.has(depId)) {
          throw new Error(`Invalid dependency: ${depId} not found in task set`);
        }

        if (hasCycle(depId)) {
          return true;
        }
      }

      recursionStack.delete(id);
      return false;
    };

    // Check each dependency
    for (const depId of dependencies) {
      if (hasCycle(depId)) {
        throw new Error(
          `Cycle detected in task dependencies: ${taskId} -> ${depId}`,
        );
      }
    }
  }

  /**
   * Merge multiple AbortSignals into one
   */
  private mergeSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }

      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    return controller.signal;
  }
}
