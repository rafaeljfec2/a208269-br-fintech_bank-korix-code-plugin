import type { ExecutionContext } from "../../types";
import type {
  ThinkingRunProfile,
  ToolUsePolicy,
  WorkspaceAccessSignal,
} from "./types";

const WORKSPACE_READ_TOOLS = [
  "ListDirectory",
  "SearchFiles",
  "ReadFile",
  "FileChunks",
] as const;

const WORKSPACE_OPEN_TOOLS = [...WORKSPACE_READ_TOOLS, "OpenFile"] as const;

const WORKSPACE_SEARCH_TOOLS = [
  "SearchFiles",
  "Grep",
  "FindReferences",
  "FindSymbols",
  "ReadFile",
  "FileChunks",
  "ListDirectory",
] as const;

const WORKSPACE_INSPECT_TOOLS = [
  "ReadFile",
  "FileChunks",
  "ListDirectory",
  "SearchFiles",
  "Grep",
  "GitStatus",
  "GitDiff",
  "ChangedFiles",
  "Problems",
  "GetDiagnostics",
  "WorkspaceGraph",
  "GetOpenFiles",
  "GetCurrentFile",
] as const;

const GIT_OPERATION_TOOLS = [
  "RunCommand",
  "GitStatus",
  "GitDiff",
  "ChangedFiles",
] as const;

export class ToolUsePolicyResolver {
  resolve(
    message: string,
    profile: ThinkingRunProfile,
    context: ExecutionContext,
  ): ToolUsePolicy {
    if (context.mode === "ask") {
      return this.none(profile.requiresWorkspaceEvidence);
    }

    const gitPolicy = this.resolveGitOperationPolicy(message, profile, context);
    if (gitPolicy) {
      return gitPolicy;
    }

    if (profile.intent === "modify") {
      return this.resolveModifyPolicy(context);
    }

    const workspacePolicy = this.resolveExplicitWorkspacePolicy(
      message,
      profile.workspaceAccess,
    );
    if (workspacePolicy) {
      return workspacePolicy;
    }

    const evidencePolicy = this.resolveEvidencePolicy(profile);
    if (evidencePolicy) {
      return evidencePolicy;
    }

    return this.none(false);
  }

  private none(evidenceRequired: boolean): ToolUsePolicy {
    return {
      mode: "none",
      allowedTools: [],
      evidenceRequired,
      allowPassiveEvidence: false,
      reason: "general",
    };
  }

  private resolveGitOperationPolicy(
    message: string,
    profile: ThinkingRunProfile,
    context: ExecutionContext,
  ): ToolUsePolicy | undefined {
    if (!this.isGitOperationRequest(message)) {
      return undefined;
    }

    return {
      mode: context.mode === "agent" ? "auto" : "required",
      allowedTools: GIT_OPERATION_TOOLS,
      evidenceRequired: true,
      allowPassiveEvidence: context.mode === "agent",
      reason: profile.intent === "modify" ? "modify" : "validate",
    };
  }

  private resolveModifyPolicy(context: ExecutionContext): ToolUsePolicy {
    return {
      mode: context.mode === "agent" ? "auto" : "required",
      allowedTools: context.mode === "agent" ? [] : WORKSPACE_INSPECT_TOOLS,
      evidenceRequired: true,
      allowPassiveEvidence: true,
      reason: "modify",
    };
  }

  private resolveExplicitWorkspacePolicy(
    message: string,
    workspaceAccess: WorkspaceAccessSignal,
  ): ToolUsePolicy | undefined {
    if (!workspaceAccess.explicit) {
      return undefined;
    }

    if (workspaceAccess.action === "search") {
      return this.requiredWorkspacePolicy(
        WORKSPACE_SEARCH_TOOLS,
        "workspace_search",
      );
    }

    if (workspaceAccess.action === "inspect") {
      return this.requiredWorkspacePolicy(
        WORKSPACE_INSPECT_TOOLS,
        "workspace_inspect",
      );
    }

    return this.requiredWorkspacePolicy(
      this.requestsEditorOpen(message)
        ? WORKSPACE_OPEN_TOOLS
        : WORKSPACE_READ_TOOLS,
      "workspace_read",
    );
  }

  private resolveEvidencePolicy(
    profile: ThinkingRunProfile,
  ): ToolUsePolicy | undefined {
    if (profile.intent === "validate" || profile.intent === "diagnose") {
      return {
        mode: "auto",
        allowedTools: WORKSPACE_INSPECT_TOOLS,
        evidenceRequired: true,
        allowPassiveEvidence: true,
        reason: "validate",
      };
    }

    if (profile.requiresWorkspaceEvidence) {
      return {
        mode: "auto",
        allowedTools: WORKSPACE_INSPECT_TOOLS,
        evidenceRequired: true,
        allowPassiveEvidence: true,
        reason: "workspace_inspect",
      };
    }

    if (!profile.requiresToolUse) {
      return undefined;
    }

    return {
      mode: "auto",
      allowedTools: [],
      evidenceRequired: false,
      allowPassiveEvidence: false,
      reason: "general",
    };
  }

  private requiredWorkspacePolicy(
    allowedTools: ToolUsePolicy["allowedTools"],
    reason: ToolUsePolicy["reason"],
  ): ToolUsePolicy {
    return {
      mode: "required",
      allowedTools,
      evidenceRequired: true,
      allowPassiveEvidence: false,
      reason,
    };
  }

  private requestsEditorOpen(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return /\b(abra|abre|abrir|open|reveal|show)\b/.test(normalized);
  }

  private isGitOperationRequest(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const hasExplicitGitCommand = /\bgit\s+[a-z-]+\b/.test(normalized);
    const hasGitTerm =
      /\b(git|commit|commits|branch|branches|develop|main|master|fetch|pull|merge|rebase|checkout)\b/.test(
        normalized,
      );
    const hasGitAction =
      /\b(analise|analisar|verifique|check|liste|listar|log|status|diff|fetch|pull|merge|rebase|checkout|atualize|atualiza|update|sincronize|sync)\b/.test(
        normalized,
      );

    return hasExplicitGitCommand || (hasGitTerm && hasGitAction);
  }
}
