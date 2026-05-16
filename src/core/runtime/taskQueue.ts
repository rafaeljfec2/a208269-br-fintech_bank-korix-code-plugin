/**
 * Task queue for managing subtasks
 */

export interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export class TaskQueue {
  private tasks: Task[] = [];

  add(description: string): Task {
    const task: Task = {
      id: this.generateTaskId(),
      description,
      status: "pending",
      createdAt: Date.now(),
    };

    this.tasks.push(task);
    return task;
  }

  start(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "in_progress";
    }
  }

  complete(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "completed";
      task.completedAt = Date.now();
    }
  }

  fail(taskId: string, error: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = "failed";
      task.error = error;
      task.completedAt = Date.now();
    }
  }

  getAll(): readonly Task[] {
    return [...this.tasks];
  }

  getPending(): readonly Task[] {
    return this.tasks.filter((t) => t.status === "pending");
  }

  clear(): void {
    this.tasks = [];
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
