import type { ExecutionContext } from "../../types";
import type { ThinkingRunProfile, ToolUsePolicy } from "./types";

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

export class ToolUsePolicyResolver {
  resolve(
    message: string,
    profile: ThinkingRunProfile,
    context: ExecutionContext,
  ): ToolUsePolicy {
    if (context.mode === "ask") {
      return this.none(profile.requiresWorkspaceEvidence);
    }

    const workspaceAccess = profile.workspaceAccess;

    if (profile.intent === "modify") {
      return {
        mode: context.mode === "agent" ? "auto" : "required",
        allowedTools: context.mode === "agent" ? [] : WORKSPACE_INSPECT_TOOLS,
        evidenceRequired: true,
        allowPassiveEvidence: true,
        reason: "modify",
      };
    }

    if (workspaceAccess.explicit) {
      if (workspaceAccess.action === "search") {
        return {
          mode: "required",
          allowedTools: WORKSPACE_SEARCH_TOOLS,
          evidenceRequired: true,
          allowPassiveEvidence: false,
          reason: "workspace_search",
        };
      }

      if (workspaceAccess.action === "inspect") {
        return {
          mode: "required",
          allowedTools: WORKSPACE_INSPECT_TOOLS,
          evidenceRequired: true,
          allowPassiveEvidence: false,
          reason: "workspace_inspect",
        };
      }

      return {
        mode: "required",
        allowedTools: this.requestsEditorOpen(message)
          ? WORKSPACE_OPEN_TOOLS
          : WORKSPACE_READ_TOOLS,
        evidenceRequired: true,
        allowPassiveEvidence: false,
        reason: "workspace_read",
      };
    }

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

    if (profile.requiresToolUse) {
      return {
        mode: "auto",
        allowedTools: [],
        evidenceRequired: false,
        allowPassiveEvidence: false,
        reason: "general",
      };
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

  private requestsEditorOpen(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return /\b(abra|abre|abrir|open|reveal|show)\b/.test(normalized);
  }
}
