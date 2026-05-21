import { describe, expect, it } from "vitest";
import { ExecutionGraph } from "./ExecutionGraph";

describe("ExecutionGraph", () => {
  it("should create causal nodes and edges", () => {
    const graph = new ExecutionGraph();
    const tool = graph.addNode("tool_call", "ReadFile", "Reading file");
    const observation = graph.addNode(
      "observation",
      "ReadFile",
      "File read completed",
    );

    graph.addEdge(tool.id, observation.id, "caused");

    const snapshot = graph.snapshot();
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0]?.from).toBe(tool.id);
    expect(snapshot.edges[0]?.to).toBe(observation.id);
  });
});
