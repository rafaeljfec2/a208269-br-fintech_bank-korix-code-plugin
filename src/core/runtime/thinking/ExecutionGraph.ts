import type {
  ExecutionGraphEdge,
  ExecutionGraphNode,
  ExecutionGraphNodeKind,
  ExecutionGraphSnapshot,
} from "./types";

export class ExecutionGraph {
  private readonly nodes: ExecutionGraphNode[] = [];
  private readonly edges: ExecutionGraphEdge[] = [];

  addNode(
    kind: ExecutionGraphNodeKind,
    label: string,
    summary: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): ExecutionGraphNode {
    const node: ExecutionGraphNode = {
      id: `node-${this.nodes.length + 1}-${Date.now()}`,
      kind,
      label,
      summary,
      timestamp: Date.now(),
      metadata,
    };

    this.nodes.push(node);
    return node;
  }

  addEdge(
    from: string,
    to: string,
    reason: ExecutionGraphEdge["reason"],
  ): ExecutionGraphEdge {
    const edge: ExecutionGraphEdge = {
      id: `edge-${this.edges.length + 1}-${Date.now()}`,
      from,
      to,
      reason,
      timestamp: Date.now(),
    };

    this.edges.push(edge);
    return edge;
  }

  snapshot(): ExecutionGraphSnapshot {
    return {
      nodes: [...this.nodes],
      edges: [...this.edges],
    };
  }
}

