/**
 * Workspace indexer - incremental file indexing
 */

import * as vscode from 'vscode';
import { getLogger } from '../../telemetry/logger';
import type { FileInfo, SymbolInfo, ImportInfo, WorkspaceIndex } from '../types';

export class WorkspaceIndexer {
  private index: WorkspaceIndex;
  private fileWatcher?: vscode.FileSystemWatcher;
  private indexing = false;

  constructor() {
    this.index = {
      files: new Map(),
      symbols: new Map(),
      imports: [],
      lastIndexed: 0,
    };
  }

  async initialize(): Promise<void> {
    const logger = getLogger();
    logger.info('Initializing workspace indexer');

    await this.indexWorkspace();
    this.setupFileWatcher();

    logger.info('Workspace indexer initialized', {
      fileCount: this.index.files.size,
      symbolCount: Array.from(this.index.symbols.values()).flat().length,
      importCount: this.index.imports.length,
    });
  }

  private async indexWorkspace(): Promise<void> {
    if (this.indexing) {
      return;
    }

    const logger = getLogger();
    this.indexing = true;

    try {
      const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c,h}',
        '**/node_modules/**',
        1000
      );

      logger.info('Found files to index', { count: files.length });

      for (const file of files) {
        await this.indexFile(file);
      }

      this.index.lastIndexed = Date.now();
    } catch (error) {
      logger.error('Failed to index workspace', error as Error);
    } finally {
      this.indexing = false;
    }
  }

  private async indexFile(uri: vscode.Uri): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const document = await vscode.workspace.openTextDocument(uri);

      const fileInfo: FileInfo = {
        path: uri.fsPath,
        size: stat.size,
        lastModified: stat.mtime,
        language: document.languageId,
      };

      this.index.files.set(uri.fsPath, fileInfo);

      await this.extractSymbols(uri, document);
      await this.extractImports(uri, document);
    } catch (error) {
      const logger = getLogger();
      logger.warn('Failed to index file', { file: uri.fsPath, error });
    }
  }

  private async extractSymbols(uri: vscode.Uri, _document: vscode.TextDocument): Promise<void> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols) {
        return;
      }

      const symbolInfos: SymbolInfo[] = [];

      const processSymbol = (symbol: vscode.DocumentSymbol, container?: string): void => {
        symbolInfos.push({
          name: symbol.name,
          kind: vscode.SymbolKind[symbol.kind],
          location: {
            file: uri.fsPath,
            line: symbol.range.start.line,
            column: symbol.range.start.character,
          },
          containerName: container,
        });

        for (const child of symbol.children) {
          processSymbol(child, symbol.name);
        }
      };

      for (const symbol of symbols) {
        processSymbol(symbol);
      }

      if (symbolInfos.length > 0) {
        this.index.symbols.set(uri.fsPath, symbolInfos);
      }
    } catch (error) {
      // Symbol provider not available for this file type
    }
  }

  private async extractImports(uri: vscode.Uri, document: vscode.TextDocument): Promise<void> {
    const text = document.getText();
    const importRegexes = [
      // TypeScript/JavaScript
      /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      // Python
      /from\s+([^\s]+)\s+import/g,
      /import\s+([^\s]+)/g,
    ];

    for (const regex of importRegexes) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const importPath = match[1];
        if (!importPath) {
          continue;
        }

        const isExternal = !importPath.startsWith('.') && !importPath.startsWith('/');

        this.index.imports.push({
          source: uri.fsPath,
          target: importPath,
          isExternal,
        });
      }
    }
  }

  private setupFileWatcher(): void {
    const logger = getLogger();

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c,h}'
    );

    this.fileWatcher.onDidCreate(async (uri) => {
      logger.debug('File created', { file: uri.fsPath });
      await this.indexFile(uri);
    });

    this.fileWatcher.onDidChange(async (uri) => {
      logger.debug('File changed', { file: uri.fsPath });
      await this.indexFile(uri);
    });

    this.fileWatcher.onDidDelete((uri) => {
      logger.debug('File deleted', { file: uri.fsPath });
      this.index.files.delete(uri.fsPath);
      this.index.symbols.delete(uri.fsPath);
      this.index.imports = this.index.imports.filter((imp) => imp.source !== uri.fsPath);
    });
  }

  getFile(path: string): FileInfo | undefined {
    return this.index.files.get(path);
  }

  getSymbols(path: string): SymbolInfo[] {
    return this.index.symbols.get(path) ?? [];
  }

  getImports(path: string): ImportInfo[] {
    return this.index.imports.filter((imp) => imp.source === path);
  }

  getAllFiles(): FileInfo[] {
    return Array.from(this.index.files.values());
  }

  findSymbol(name: string): SymbolInfo | undefined {
    for (const symbols of this.index.symbols.values()) {
      const found = symbols.find((s) => s.name === name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  dispose(): void {
    this.fileWatcher?.dispose();
  }
}
