import type {
  EvidencePack,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingRunProfile,
} from "./types";

export interface ResponseValidationInput {
  readonly profile: ThinkingRunProfile;
  readonly response: string;
  readonly evidence?: EvidencePack;
  readonly observations: readonly ObservationSummary[];
}

export class HallucinationGuard {
  validate(input: ResponseValidationInput): ResponseValidationResult {
    const evidenceCount = input.evidence?.items.length ?? 0;
    const successfulObservations = input.observations.filter((item) => item.success);
    const riskFlags: string[] = [];

    if (input.profile.requiresWorkspaceEvidence && evidenceCount === 0 && successfulObservations.length === 0) {
      riskFlags.push("missing_workspace_evidence");
    }

    if (input.response.length > 0 && this.hasOverconfidentLanguage(input.response) && riskFlags.length > 0) {
      riskFlags.push("overconfident_without_evidence");
    }

    if (input.response.length === 0) {
      riskFlags.push("empty_response");
    }

    const status = riskFlags.includes("missing_workspace_evidence")
      ? "warning"
      : riskFlags.length > 0
      ? "warning"
      : "passed";

    return {
      status,
      summary:
        status === "passed"
          ? "Response validated against available runtime evidence."
          : "Response needs uncertainty marking because evidence is incomplete.",
      requiresEvidence: input.profile.requiresWorkspaceEvidence,
      evidenceCount,
      riskFlags,
      suggestedPrefix:
        status === "passed"
          ? undefined
          : "Com a evidência disponível, não consigo afirmar isso com total certeza. ",
      timestamp: Date.now(),
    };
  }

  applyValidation(response: string, validation: ResponseValidationResult): string {
    if (validation.status === "passed" || !validation.suggestedPrefix) {
      return response;
    }

    if (response.startsWith(validation.suggestedPrefix)) {
      return response;
    }

    return `${validation.suggestedPrefix}${response}`;
  }

  private hasOverconfidentLanguage(response: string): boolean {
    return /\b(definitivamente|com certeza|sempre|nunca|obviamente|clearly|definitely|always|never)\b/i.test(
      response,
    );
  }
}

