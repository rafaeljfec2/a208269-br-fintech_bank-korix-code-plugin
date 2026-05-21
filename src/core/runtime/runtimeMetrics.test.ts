import { describe, expect, it } from "vitest";
import { Logger } from "../../telemetry/logger";
import { RuntimeMetrics } from "./runtimeMetrics";

describe("RuntimeMetrics latency summary", () => {
  it("should aggregate provider, tool, approval, and buffering latency", () => {
    const metrics = new RuntimeMetrics(new Logger({ level: "error" }));

    metrics.recordProviderDuration(1200);
    metrics.recordProviderFirstOutputLatency(300);
    metrics.recordToolDuration(20);
    metrics.recordApprovalWait(500);
    metrics.recordResponseBufferDuration(90);

    const snapshot = metrics.finalize();

    expect(snapshot.latency).toMatchObject({
      providerDurationMs: 1200,
      providerFirstOutputLatencyMs: 300,
      toolDurationMs: 20,
      approvalWaitMs: 500,
      responseBufferDurationMs: 90,
      iterationOverheadMs: expect.any(Number),
    });
  });
});
