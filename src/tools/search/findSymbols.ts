/**
 * FindSymbols Tool - LSP-based workspace symbol search
 *
 * Performance target: < 200ms for 100 symbols
 *
 * Uses VSCode Language Server Protocol:
 * - vscode.executeWorkspaceSymbolProvider
 * - Indexes all symbols in workspace
 * - Fuzzy matching built-in
 */

import * as vscode from 'vscode';
import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../../harness/toolRegistry';

const FindSymbolsSchema = z.object({
  query: z.string().describe('Symbol name pattern (supports fuzzy matching)'),
  kind: z.enum([
    'function',
    'class',
    'interface',
    'variable',
    'constant',
    'method',
    'property',
    'enum',
    'module',
    'all',
  ]).optional().describe('Symbol kind filter (default: all)'),
  maxResults: z.number().optional().describe('Maximum results (default: 100)'),
});

type FindSymbolsInput = z.infer<typeof FindSymbolsSchema>;

interface Symbol {
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly containerName?: string; // Parent scope (e.g., class name)
}

/**
 * Find symbols using VSCode LSP
 *
 * Algorithm:
 * 1. Execute vscode.executeWorkspaceSymbolProvider with query
 * 2. Filter by symbol kind if specified
 * 3. Limit to maxResults
 * 4. Return structured symbols
 *
 * VSCode LSP provides fuzzy matching automatically
 */
export const FindSymbolsTool: Tool<FindSymbolsInput, Symbol[]> = {
  name: 'FindSymbols',
  description: 'Find symbols in workspace using LSP (fuzzy matching)',
  schema: FindSymbolsSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: FindSymbolsInput,
    _context: ToolContext
  ): Promise<ToolResult<Symbol[]>> {
    const startTime = Date.now();

    try {
      const symbols = await findSymbols(input);

      return {
        success: true,
        data: symbols,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

/**
 * Find symbols using VSCode LSP
 */
async function findSymbols(input: FindSymbolsInput): Promise<Symbol[]> {
  // Execute workspace symbol provider
  const symbolInfos = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider',
    input.query
  );

  if (!symbolInfos || symbolInfos.length === 0) {
    return [];
  }

  // Filter by kind if specified
  let filtered = symbolInfos;

  if (input.kind && input.kind !== 'all') {
    const targetKind = symbolKindFromString(input.kind);
    if (targetKind !== undefined) {
      filtered = symbolInfos.filter(s => s.kind === targetKind);
    }
  }

  // Limit results
  const maxResults = input.maxResults ?? 100;
  const limited = filtered.slice(0, maxResults);

  // Convert to structured format
  const symbols: Symbol[] = limited.map(symbolInfo => ({
    name: symbolInfo.name,
    kind: vscode.SymbolKind[symbolInfo.kind],
    file: symbolInfo.location.uri.fsPath,
    line: symbolInfo.location.range.start.line,
    column: symbolInfo.location.range.start.character,
    containerName: symbolInfo.containerName,
  }));

  return symbols;
}

/**
 * Convert string to VSCode SymbolKind
 */
function symbolKindFromString(kind: string): vscode.SymbolKind | undefined {
  switch (kind) {
    case 'function':
      return vscode.SymbolKind.Function;
    case 'class':
      return vscode.SymbolKind.Class;
    case 'interface':
      return vscode.SymbolKind.Interface;
    case 'variable':
      return vscode.SymbolKind.Variable;
    case 'constant':
      return vscode.SymbolKind.Constant;
    case 'method':
      return vscode.SymbolKind.Method;
    case 'property':
      return vscode.SymbolKind.Property;
    case 'enum':
      return vscode.SymbolKind.Enum;
    case 'module':
      return vscode.SymbolKind.Module;
    default:
      return undefined;
  }
}
