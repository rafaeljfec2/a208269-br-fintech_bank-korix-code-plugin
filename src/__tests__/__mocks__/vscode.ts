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
  fs: {
    stat: () => Promise.resolve({ size: 0, mtime: 0 }),
  },
  findFiles: () => Promise.resolve([]),
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue,
  }),
};

export class Position {
  constructor(
    public line: number,
    public column: number,
  ) {}
}

export class Range {
  constructor(
    public startLine: number,
    public startColumn: number,
    public endLine: number,
    public endColumn: number,
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
