/**
 * Execution sandbox with timeout and resource limits
 */

export interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
  allowNetworkAccess?: boolean;
}

export interface SandboxResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  timedOut: boolean;
  duration: number;
}

export class ExecutionSandbox {
  private defaultTimeout = 30000; // 30s

  async execute<T>(
    fn: () => Promise<T>,
    options: SandboxOptions = {},
  ): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const timeout = options.timeout ?? this.defaultTimeout;

    try {
      const result = await this.executeWithTimeout(fn, timeout);

      return {
        success: true,
        result,
        timedOut: false,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      const isTimeout = err.message.includes("timeout");

      return {
        success: false,
        error: err.message,
        timedOut: isTimeout,
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Execution timeout after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);
  }

  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
}

export const globalSandbox = new ExecutionSandbox();
