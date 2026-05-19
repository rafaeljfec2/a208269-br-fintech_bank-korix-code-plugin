import type { ObservationSummary, ThinkingTimelineItem } from "./types";

export class ReflectionEngine {
  reflectOnObservation(summary: ObservationSummary): ThinkingTimelineItem | null {
    if (summary.success) {
      return null;
    }

    return {
      id: `reflection-${summary.id}`,
      stage: "reflecting",
      title: "Adjusting strategy",
      summary: summary.retryHint ?? "Tool failed; next action should change strategy before retrying.",
      status: "warning",
      timestamp: Date.now(),
      metadata: {
        sourceName: summary.sourceName,
        sourceType: summary.sourceType,
      },
    };
  }
}

