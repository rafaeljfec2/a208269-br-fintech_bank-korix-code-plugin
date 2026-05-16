/**
 * Context engine types
 */

export interface FileInfo {
  path: string;
  content?: string;
  size: number;
  lastModified: number;
  language?: string;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  containerName?: string;
}

export interface ImportInfo {
  source: string;
  target: string;
  isExternal: boolean;
}

export interface WorkspaceIndex {
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  imports: ImportInfo[];
  lastIndexed: number;
}

export interface RankingScore {
  file: string;
  score: number;
  reasons: string[];
}

export interface ContextItem {
  file: string;
  content: string;
  priority: number;
  tokenCount: number;
}

export interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
}

export interface HeuristicWeights {
  currentFile: number;
  userSelection: number;
  directImports: number;
  gitDiff: number;
  openTabs: number;
  relatedSymbols: number;
  recentlyModified: number;
}
