import type {
  ContextCacheSnapshot,
  WorkspaceGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
} from "./types";

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort(compareText);
}

function sortedEdges(
  snapshot: ContextCacheSnapshot,
): readonly WorkspaceGraphEdge[] {
  return [...(snapshot.graphEdges ?? [])].sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareText(left.to, right.to) ||
      compareText(left.type, right.type),
  );
}

function graphNode(
  path: string,
  edges: readonly WorkspaceGraphEdge[],
): WorkspaceGraphNode {
  return {
    path,
    imports: uniqueSorted(
      edges.filter((edge) => edge.from === path).map((edge) => edge.to),
    ),
    importedBy: uniqueSorted(
      edges.filter((edge) => edge.to === path).map((edge) => edge.from),
    ),
    symbols: [],
  };
}

export function createContextGraphSnapshot(
  snapshot: ContextCacheSnapshot,
): WorkspaceGraph {
  const edges = sortedEdges(snapshot);
  const files = snapshot.files.map((file) => file.path).sort(compareText);
  const nodes = files.map((file) => graphNode(file, edges));

  return {
    nodes,
    edges,
    totalFiles: nodes.length,
    totalImports: edges.length,
  };
}
