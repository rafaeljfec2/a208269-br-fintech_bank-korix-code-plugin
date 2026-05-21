import { describe, expect, it } from "vitest";
import { ObservationEngine } from "./ObservationEngine";

describe("ObservationEngine", () => {
  it("should summarize large failing output with important lines", () => {
    const output = [
      "line ok",
      "another line",
      "ERROR: JWT expiration expected 401 received 200",
      ...Array.from({ length: 100 }, (_, index) => `noise ${index}`),
    ].join("\n");

    const summary = new ObservationEngine().summarizeToolResult(
      "RunCommand",
      output,
      false,
    );

    expect(summary.success).toBe(false);
    expect(summary.sourceType).toBe("terminal");
    expect(summary.importantLines[0]).toContain("JWT expiration");
    expect(summary.truncated).toBe(true);
    expect(summary.retryHint).toBeDefined();
  });

  it("should keep small successful output available for tool message", () => {
    const engine = new ObservationEngine();
    const result = { ok: true };
    const summary = engine.summarizeToolResult("ReadFile", result, true);

    expect(engine.toToolMessageContent(summary, result)).toContain('"ok"');
  });
});
