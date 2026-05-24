import {
  ContextQualityTelemetryBuffer,
  type ContextIR,
  type ContextQualityBenchmarkSummary,
} from "@korix/context-compiler";
import type {
  RuntimeEvent,
  RuntimeEventEmitter,
} from "../../core/runtime/runtimeEvents";
import type { Logger } from "../../telemetry/logger";

interface EditFileToolResultData {
  readonly appliedCount: number;
  readonly errorCount: number;
}

function editFileToolResultData(
  result: unknown,
): EditFileToolResultData | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  const candidate = result as Record<string, unknown>;
  if (
    typeof candidate.appliedCount !== "number" ||
    typeof candidate.errorCount !== "number"
  ) {
    return undefined;
  }

  return {
    appliedCount: candidate.appliedCount,
    errorCount: candidate.errorCount,
  };
}

export class ContextQualityRuntimeTelemetry {
  private lastContextIr?: ContextIR;
  private observedPatchAccepted?: boolean;

  constructor(
    private readonly logger: Pick<Logger, "debug">,
    private readonly eventEmitter: RuntimeEventEmitter,
    private readonly telemetry = new ContextQualityTelemetryBuffer(),
  ) {}

  setContextIr(contextIr: ContextIR): void {
    this.lastContextIr = contextIr;
  }

  summarize(): ContextQualityBenchmarkSummary {
    return this.telemetry.summarize();
  }

  samples(): ReturnType<ContextQualityTelemetryBuffer["samples"]> {
    return this.telemetry.samples();
  }

  reset(): void {
    this.lastContextIr = undefined;
    this.observedPatchAccepted = undefined;
  }

  attach(): () => void {
    const listener = (event: RuntimeEvent): void => {
      this.recordEvent(event);
    };
    this.eventEmitter.on("event", listener);
    return () => {
      this.eventEmitter.off("event", listener);
    };
  }

  recordEvent(event: RuntimeEvent): void {
    if (event.type === "patch_failed") {
      this.observedPatchAccepted = false;
      return;
    }

    if (
      event.type === "patch_applied" &&
      this.observedPatchAccepted === undefined
    ) {
      this.observedPatchAccepted = true;
      return;
    }

    if (event.type === "tool_result" && event.name === "EditFile") {
      this.recordEditFileResult(event.success, event.result);
      return;
    }

    if (
      event.type !== "execution_complete" ||
      this.lastContextIr === undefined
    ) {
      return;
    }

    const sample = this.telemetry.record({
      id: `runtime-${event.timestamp}`,
      contextIr: this.lastContextIr,
      compiledOutcome: {
        patchAccepted: this.observedPatchAccepted,
        taskCompleted: event.success,
      },
    });

    this.logger.debug("Recorded context quality telemetry sample", {
      id: sample.id,
      patchAccepted: sample.compiledPatchAccepted,
      taskCompleted: sample.compiledTaskCompleted,
    });
    this.reset();
  }

  private recordEditFileResult(success: boolean, resultData: unknown): void {
    if (!success) {
      this.observedPatchAccepted = false;
      return;
    }

    const result = editFileToolResultData(resultData);
    if (
      result !== undefined &&
      this.observedPatchAccepted === undefined &&
      result.appliedCount > 0 &&
      result.errorCount === 0
    ) {
      this.observedPatchAccepted = true;
    }
  }
}
