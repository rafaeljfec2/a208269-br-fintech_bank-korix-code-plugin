import type {
  EvidencePack,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingRunProfile,
  ThinkingStage,
  ThinkingStatus,
  ThinkingTimelineItem,
} from "./types";

export class RuntimeNarrator {
  step(
    stage: ThinkingStage,
    title: string,
    summary: string,
    status: ThinkingStatus = "pending",
    metadata?: Readonly<Record<string, unknown>>,
  ): ThinkingTimelineItem {
    return {
      id: `think-${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      stage,
      title,
      summary,
      status,
      timestamp: Date.now(),
      metadata,
    };
  }

  profile(profile: ThinkingRunProfile): ThinkingTimelineItem {
    return this.step(
      "analyzing_request",
      "Analyzing request",
      profile.summary,
      "success",
      {
        intent: profile.intent,
        riskLevel: profile.riskLevel,
        requiresWorkspaceEvidence: profile.requiresWorkspaceEvidence,
      },
    );
  }

  evidence(pack: EvidencePack): ThinkingTimelineItem {
    return this.step(
      "collecting_evidence",
      "Checking workspace evidence",
      pack.summary,
      pack.items.length > 0 ? "success" : "warning",
      {
        itemCount: pack.items.length,
        totalTokens: pack.totalTokens,
      },
    );
  }

  observation(summary: ObservationSummary): ThinkingTimelineItem {
    return this.step(
      "summarizing_observation",
      "Summarizing observation",
      summary.summary,
      summary.success ? "success" : "warning",
      {
        sourceName: summary.sourceName,
        rawSize: summary.rawSize,
        truncated: summary.truncated,
      },
    );
  }

  validation(validation: ResponseValidationResult): ThinkingTimelineItem {
    return this.step(
      "validating_response",
      "Validating answer",
      validation.summary,
      validation.status === "passed" ? "success" : "warning",
      {
        evidenceCount: validation.evidenceCount,
        riskFlags: validation.riskFlags,
      },
    );
  }
}

