/**
 * Runtime state management for agent execution
 */

import type { RuntimeState, ExecutionContext, Message } from "../types";
import { EventEmitter } from "eventemitter3";

export interface RuntimeStateEvents {
  stateChanged: (state: RuntimeState) => void;
  iterationComplete: (iteration: number) => void;
  executionStarted: () => void;
  executionCompleted: () => void;
  executionFailed: (error: Error) => void;
}

export class RuntimeStateManager extends EventEmitter<RuntimeStateEvents> {
  private state: RuntimeState;

  constructor(initialContext: ExecutionContext) {
    super();

    this.state = {
      session: {
        id: this.generateSessionId(),
        mode: initialContext.mode,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      context: initialContext,
      isExecuting: false,
      currentIteration: 0,
      maxIterations: 25,
      checkpoints: [],
    };
  }

  getState(): Readonly<RuntimeState> {
    return { ...this.state };
  }

  setState(updates: Partial<RuntimeState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };
    this.emit("stateChanged", this.getState());
  }

  addMessage(message: Message): void {
    this.state.session.messages.push(message);
    this.state.session.updatedAt = Date.now();
    this.emit("stateChanged", this.getState());
  }

  getMessages(): readonly Message[] {
    return [...this.state.session.messages];
  }

  clearMessages(): void {
    this.state.session.messages = [];
    this.state.session.updatedAt = Date.now();
    this.emit("stateChanged", this.getState());
  }

  startExecution(): void {
    this.state.isExecuting = true;
    this.state.currentIteration = 0;
    this.emit("executionStarted");
    this.emit("stateChanged", this.getState());
  }

  stopExecution(): void {
    this.state.isExecuting = false;
    this.emit("executionCompleted");
    this.emit("stateChanged", this.getState());
  }

  incrementIteration(): void {
    this.state.currentIteration++;
    this.emit("iterationComplete", this.state.currentIteration);
    this.emit("stateChanged", this.getState());
  }

  getCurrentIteration(): number {
    return this.state.currentIteration;
  }

  getMaxIterations(): number {
    return this.state.maxIterations;
  }

  setMaxIterations(max: number): void {
    this.state.maxIterations = max;
    this.emit("stateChanged", this.getState());
  }

  isExecuting(): boolean {
    return this.state.isExecuting;
  }

  hasReachedMaxIterations(): boolean {
    return this.state.currentIteration >= this.state.maxIterations;
  }

  getContext(): ExecutionContext {
    return { ...this.state.context };
  }

  updateContext(updates: Partial<ExecutionContext>): void {
    this.state.context = {
      ...this.state.context,
      ...updates,
    };
    this.emit("stateChanged", this.getState());
  }

  reset(): void {
    const currentContext = this.state.context;
    this.state = {
      session: {
        id: this.generateSessionId(),
        mode: currentContext.mode,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      context: currentContext,
      isExecuting: false,
      currentIteration: 0,
      maxIterations: 25,
      checkpoints: [],
    };
    this.emit("stateChanged", this.getState());
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
