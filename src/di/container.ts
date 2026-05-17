/**
 * Simple Dependency Injection Container
 */

export type Factory<T> = (container: Container) => T;
// Phantom type for compile-time type safety
export type Token<T = unknown> = (symbol | string) & { __type?: T };

interface Binding<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private bindings = new Map<Token, Binding<unknown>>();

  /**
   * Bind a token to a factory function
   */
  bind<T>(token: Token<T>, factory: Factory<T>, singleton = false): this {
    this.bindings.set(token, {
      factory: factory,
      singleton,
    });
    return this;
  }

  /**
   * Bind a token to a singleton factory
   */
  bindSingleton<T>(token: Token<T>, factory: Factory<T>): this {
    return this.bind(token, factory, true);
  }

  /**
   * Bind a token to a constant value (singleton)
   */
  bindValue<T>(token: Token<T>, value: T): this {
    return this.bindSingleton(token, () => value);
  }

  /**
   * Resolve a token to an instance
   */
  get<T>(token: Token<T>): T {
    const binding = this.bindings.get(token) as Binding<T> | undefined;

    if (!binding) {
      throw new Error(`No binding found for token: ${String(token)}`);
    }

    if (binding.singleton) {
      if (!binding.instance) {
        binding.instance = binding.factory(this);
      }
      return binding.instance;
    }

    return binding.factory(this);
  }

  /**
   * Check if a token is bound
   */
  has(token: Token): boolean {
    return this.bindings.has(token);
  }

  /**
   * Remove a binding
   */
  unbind(token: Token): void {
    this.bindings.delete(token);
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings.clear();
  }
}

// Global container instance
let globalContainer: Container | null = null;

export function createContainer(): Container {
  return new Container();
}

export function setGlobalContainer(container: Container): void {
  globalContainer = container;
}

export function getGlobalContainer(): Container {
  if (!globalContainer) {
    throw new Error("Global container not initialized");
  }
  return globalContainer;
}
