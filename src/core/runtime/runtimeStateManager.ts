/**
 * Runtime State Manager - Singleton wrapper for RuntimeState
 * Maintains state between executions and provides controlled access
 *
 * Concurrency behavior:
 * - initialize() throws if called during active execution (isExecuting === true)
 * - All state mutations are guarded against uninitialized access
 * - Single-threaded design (VSCode Extension Host is single-threaded)
 */

import type { ExecutionContext, Message, Mode } from "../types";
import { RuntimeState } from "./runtimeState";
import type { RuntimeStateSnapshot } from "./runtimeTypes";

export class RuntimeStateManager {
  private currentState: RuntimeState | null = null;
  private currentMode: Mode = "ask";
  private currentSessionId: string | null = null;

  /**
   * Initialize or reset runtime state
   * @throws Error if called during active execution
   */
  initialize(context: ExecutionContext, maxIterations = 25): void {
    if (this.isExecuting()) {
      throw new Error(
        "Cannot initialize RuntimeState while execution is active. Call stopExecution() first.",
      );
    }

    this.currentState = new RuntimeState(context, maxIterations);
    this.currentSessionId = crypto.randomUUID();
    this.currentMode = context.mode;
  }

  /**
   * Prepare state for a new user interaction using the context captured at send time.
   * The webview session is preserved, but runtime state is fresh for this turn.
   */
  prepareInteraction(context: ExecutionContext, maxIterations = 25): void {
    if (this.isExecuting()) {
      throw new Error(
        "Cannot prepare interaction while execution is active. Call stopExecution() first.",
      );
    }

    this.currentState = new RuntimeState(context, maxIterations);
    this.currentSessionId = this.currentSessionId ?? crypto.randomUUID();
    this.currentMode = context.mode;
  }

  /**
   * Get current runtime state (INTERNAL - throws if not initialized)
   * @private - use specific getters instead
   */
  private getState(): RuntimeState {
    if (!this.currentState) {
      throw new Error("RuntimeState not initialized. Call initialize() first.");
    }
    return this.currentState;
  }

  /**
   * Check if state is initialized
   */
  isInitialized(): boolean {
    return this.currentState !== null;
  }

  /**
   * Get current mode
   */
  getMode(): Mode {
    return this.currentMode;
  }

  /**
   * Set current mode
   * Note: mode is tracked in manager, not in RuntimeState
   * (RuntimeState uses ExecutionContext.mode which is immutable after creation)
   */
  setMode(mode: Mode): void {
    this.currentMode = mode;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Check if agent is executing
   */
  isExecuting(): boolean {
    if (!this.currentState) {
      return false;
    }
    return this.currentState.getExecution().isExecuting;
  }

  /**
   * Get current iteration count
   */
  getCurrentIteration(): number {
    if (!this.currentState) {
      return 0;
    }
    return this.currentState.getExecution().currentIteration;
  }

  /**
   * Get conversation messages
   */
  getMessages(): readonly Message[] {
    if (!this.currentState) {
      return [];
    }
    return this.currentState.getConversation().messages;
  }

  /**
   * Add message to conversation
   */
  addMessage(message: Message): void {
    const state = this.getState();
    state.addMessage(message);
  }

  /**
   * Start execution
   */
  startExecution(): void {
    const state = this.getState();
    state.startExecution();
  }

  /**
   * Stop execution
   */
  stopExecution(): void {
    if (this.currentState) {
      this.currentState.stopExecution();
    }
  }

  /**
   * Create snapshot of current state
   */
  createSnapshot(): RuntimeStateSnapshot | null {
    if (!this.currentState) {
      return null;
    }
    return this.currentState.createSnapshot();
  }

  /**
   * Restore state from snapshot
   */
  restoreSnapshot(snapshot: RuntimeStateSnapshot): void {
    const state = this.getState();
    state.restoreSnapshot(snapshot);
  }

  /**
   * Reset state (clear conversation, reset execution)
   */
  reset(): void {
    this.currentState = null;
    this.currentSessionId = null;
  }
}
