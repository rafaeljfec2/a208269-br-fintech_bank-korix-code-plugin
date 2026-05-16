/**
 * Task queue - priority queue with AbortController per task
 */

import type { Logger } from '../../telemetry/logger';
import type { Task } from './runtimeTypes';

export class TaskQueue {
  private queue: Task[] = [];
  private activeTask: Task | null = null;
  private abortControllers = new Map<string, AbortController>();

  constructor(private readonly logger: Logger) {}

  enqueue(task: Task): void {
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.abortControllers.set(task.id, new AbortController());
    this.logger.debug('Task enqueued', { id: task.id, priority: task.priority });
  }

  dequeue(): Task | null {
    const task = this.queue.shift();
    if (task) {
      this.activeTask = task;
      this.logger.debug('Task dequeued', { id: task.id });
    }
    return task ?? null;
  }

  complete(taskId: string): void {
    if (this.activeTask?.id === taskId) {
      this.activeTask = null;
    }
    this.abortControllers.delete(taskId);
    this.logger.debug('Task completed', { id: taskId });
  }

  cancel(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.logger.info('Task cancelled', { id: taskId });
    }
    
    if (this.activeTask?.id === taskId) {
      this.activeTask = null;
    }
    
    this.queue = this.queue.filter((t) => t.id !== taskId);
    this.abortControllers.delete(taskId);
  }

  getAbortSignal(taskId: string): AbortSignal | undefined {
    return this.abortControllers.get(taskId)?.signal;
  }

  getActiveTask(): Task | null {
    return this.activeTask;
  }

  size(): number {
    return this.queue.length;
  }
}
