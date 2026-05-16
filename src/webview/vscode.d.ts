/**
 * VSCode API types for webview
 * Available via acquireVsCodeApi() in the webview context
 */

interface VsCodeApi<TState = unknown> {
  postMessage(message: unknown): void;
  getState(): TState | undefined;
  setState(state: TState): void;
}

declare function acquireVsCodeApi<TState = unknown>(): VsCodeApi<TState>;
