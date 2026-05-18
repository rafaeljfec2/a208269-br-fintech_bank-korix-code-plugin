/**
 * Disposable interface - runtime layer implementation
 *
 * Provides VSCode-compatible Disposable interface without importing vscode module.
 * This maintains runtime layer testability and independence.
 */

export interface Disposable {
  dispose(): void;
}

export class SimpleDisposable implements Disposable {
  constructor(private readonly callback: () => void) {}

  dispose(): void {
    this.callback();
  }
}
