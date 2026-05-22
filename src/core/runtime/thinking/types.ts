import type { ExecutionContext } from "../../types";

export type ThinkingIntent =
  | "answer"
  | "explain"
  | "plan"
  | "modify"
  | "diagnose"
  | "validate";

export type ThinkingRiskLevel = "low" | "medium" | "high";

export type WorkspaceAccessAction = "read" | "search" | "inspect" | "none";

export interface WorkspaceAccessSignal {
  readonly requested: boolean;
  readonly action: WorkspaceAccessAction;
  readonly explicit: boolean;
}

export type ToolUseMode = "none" | "auto" | "required";

export type ToolUseReason =
  | "general"
  | "workspace_read"
  | "workspace_search"
  | "workspace_inspect"
  | "modify"
  | "validate";

export interface ToolUsePolicy {
  readonly mode: ToolUseMode;
  readonly allowedTools: readonly string[];
  readonly evidenceRequired: boolean;
  readonly allowPassiveEvidence: boolean;
  readonly reason: ToolUseReason;
}

export type RuntimeExecutionPath = "direct_llm" | "agent_loop";

export type RuntimeExecutionProfile = "simple_chat" | "direct_answer";

export type RuntimeExecutionReason =
  | "simple_chat"
  | "low_risk_answer"
  | "tool_required"
  | "workspace_required";

export interface RuntimeExecutionPlan {
  readonly path: RuntimeExecutionPath;
  readonly profile?: RuntimeExecutionProfile;
  readonly maxTokens?: number;
  readonly maxHistoryMessages?: number;
  readonly maxHistoryChars?: number;
  readonly reason: RuntimeExecutionReason;
}

export interface WorkspaceEvidencePlan {
  readonly kind: "list" | "read" | "search" | "inspect";
  readonly toolNames: readonly string[];
  readonly targetHints: readonly string[];
  readonly maxFiles: number;
  readonly maxChunksPerFile: number;
}

export type ThinkingStage =
  | "analyzing_request"
  | "checking_context"
  | "collecting_evidence"
  | "executing_loop"
  | "summarizing_observation"
  | "reflecting"
  | "validating_response"
  | "completed";

export type ThinkingStatus = "pending" | "success" | "warning" | "error";

export interface ThinkingRunProfile {
  readonly intent: ThinkingIntent;
  readonly riskLevel: ThinkingRiskLevel;
  readonly requiresWorkspaceEvidence: boolean;
  readonly requiresToolUse: boolean;
  readonly workspaceAccess: WorkspaceAccessSignal;
  readonly mentionedSymbols: readonly string[];
  readonly constraints: readonly string[];
  readonly summary: string;
}

export interface ThinkingTimelineItem {
  readonly id: string;
  readonly stage: ThinkingStage;
  readonly title: string;
  readonly summary: string;
  readonly status: ThinkingStatus;
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvidenceItem {
  readonly path: string;
  readonly priority: number;
  readonly tokenCount: number;
}

export interface EvidencePack {
  readonly summary: string;
  readonly providerContext: string;
  readonly items: readonly EvidenceItem[];
  readonly totalTokens: number;
}

export interface ObservationSummary {
  readonly id: string;
  readonly sourceType: "tool" | "terminal" | "diagnostic" | "patch" | "runtime";
  readonly sourceName: string;
  readonly success: boolean;
  readonly summary: string;
  readonly importantLines: readonly string[];
  readonly rawSize: number;
  readonly truncated: boolean;
  readonly retryHint?: string;
  readonly timestamp: number;
}

export interface ResponseValidationResult {
  readonly status: "passed" | "warning" | "blocked";
  readonly summary: string;
  readonly requiresEvidence: boolean;
  readonly evidenceCount: number;
  readonly riskFlags: readonly string[];
  readonly suggestedPrefix?: string;
  readonly timestamp: number;
}

export type ExecutionGraphNodeKind =
  | "analysis"
  | "context"
  | "tool_call"
  | "observation"
  | "reflection"
  | "validation"
  | "response";

export interface ExecutionGraphNode {
  readonly id: string;
  readonly kind: ExecutionGraphNodeKind;
  readonly label: string;
  readonly summary: string;
  readonly timestamp: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExecutionGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly reason: "caused" | "depends_on" | "retry" | "validates";
  readonly timestamp: number;
}

export interface ExecutionGraphSnapshot {
  readonly nodes: readonly ExecutionGraphNode[];
  readonly edges: readonly ExecutionGraphEdge[];
}

export interface ThinkingRunInput {
  readonly initialMessage: string;
  readonly context: ExecutionContext;
  readonly previousMessages?: readonly {
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }[];
}

export interface EvidenceRequest {
  readonly message: string;
  readonly profile: ThinkingRunProfile;
  readonly context: ExecutionContext;
}

export interface WorkspaceEvidenceCollectionRequest {
  readonly message: string;
  readonly profile: ThinkingRunProfile;
  readonly context: ExecutionContext;
  readonly plan: WorkspaceEvidencePlan;
}

export interface WorkspaceEvidenceFile {
  readonly path: string;
  readonly content: string;
  readonly sourceTool: string;
  readonly truncated: boolean;
}

export interface OmittedWorkspaceEvidenceFile {
  readonly path: string;
  readonly reason: "outside_workspace" | "max_files" | "read_failed";
}

export interface WorkspaceEvidenceCollection {
  readonly success: boolean;
  readonly summary: string;
  readonly evidence: EvidencePack;
  readonly files: readonly WorkspaceEvidenceFile[];
  readonly omittedFiles: readonly OmittedWorkspaceEvidenceFile[];
  readonly duration: number;
  readonly error?: string;
}
