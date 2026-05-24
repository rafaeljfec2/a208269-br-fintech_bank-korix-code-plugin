/**
 * WorkspaceGraph Tool - file relationship graph for context ranking
 *
 * Performance target: < 1s for 5000 files
 *
 * Builds graph from:
 * - Import statements
 * - Symbol references
 * - File dependencies
 *
 * Used for:
 * - Context relevance scoring
 * - Related file discovery
 * - Dependency analysis
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";
import type { ContextEngine } from "../../context/contextEngine";
import { getGlobalContainer } from "../../di/container";
import { TOKENS } from "../../di/tokens";

const WorkspaceGraphSchema = z.object({
  rootFile: z.string().optional().describe("Root file to start graph from"),
  maxDepth: z
    .number()
    .optional()
    .describe("Maximum depth for graph traversal (default: 3)"),
  includeSymbols: z
    .boolean()
    .optional()
    .describe("Include symbol relationships (default: true)"),
});

type WorkspaceGraphInput = z.infer<typeof WorkspaceGraphSchema>;

interface GraphNode {
  readonly path: string;
  readonly imports: readonly string[];
  readonly importedBy: readonly string[];
  readonly symbols: readonly string[];
  readonly distance?: number; // Distance from root file
}

interface WorkspaceGraphResult {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly type: string;
  }[];
  readonly totalFiles: number;
  readonly totalImports: number;
}

/**
 * Build workspace graph
 *
 * Algorithm:
 * 1. Get workspace index from ContextEngine
 * 2. Build adjacency list from imports
 * 3. If rootFile specified, BFS from root with maxDepth
 * 4. Return graph with nodes and edges
 */
export const WorkspaceGraphTool: Tool<
  WorkspaceGraphInput,
  WorkspaceGraphResult
> = {
  name: "WorkspaceGraph",
  description: "Build file relationship graph for context ranking",
  schema: WorkspaceGraphSchema,

  allowedInMode(_mode): boolean {
    return true; // Allowed in all modes
  },

  async execute(
    input: WorkspaceGraphInput,
    _context: ToolContext,
  ): Promise<ToolResult<WorkspaceGraphResult>> {
    const startTime = Date.now();

    try {
      const graph = await buildWorkspaceGraph(input);

      return {
        success: true,
        data: graph,
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
 * Build workspace graph from index
 */
async function buildWorkspaceGraph(
  input: WorkspaceGraphInput,
): Promise<WorkspaceGraphResult> {
  const contextEngine =
    getGlobalContainer().get<ContextEngine>(TOKENS.ContextEngine);
  const graph = await contextEngine.getWorkspaceGraph({
    rootFile: input.rootFile,
    maxDepth: input.maxDepth,
  });
  const includeSymbols = input.includeSymbols ?? true;

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      symbols: includeSymbols ? node.symbols : [],
    })),
    edges: graph.edges,
    totalFiles: graph.totalFiles,
    totalImports: graph.totalImports,
  };
}
