/**
 * VSCode API mock for tests
 */

export class EventEmitter<T> {
  event = () => ({ dispose: () => {} });
  fire = (_data: T) => {};
  dispose = () => {};
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
};

export const workspace = {
  openTextDocument: () => Promise.resolve({}),
};

export class Position {
  constructor(
    public line: number,
    public column: number,
  ) {}
}

export const commands = {
  executeCommand: () => Promise.resolve(),
};

export class Disposable {
  private _callback?: () => void;

  constructor(callback?: () => void) {
    this._callback = callback;
  }

  dispose() {
    if (this._callback) {
      this._callback();
    }
  }
}
