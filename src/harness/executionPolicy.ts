/**
 * Execution policies for destructive actions
 */

export type ActionType = "read" | "write" | "delete" | "execute" | "network";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ExecutionPolicy {
  action: ActionType;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  canRunInReadOnlyMode: boolean;
}

export const defaultPolicies: Record<string, ExecutionPolicy> = {
  ReadFile: {
    action: "read",
    riskLevel: "low",
    requiresApproval: false,
    canRunInReadOnlyMode: true,
  },
  WriteFile: {
    action: "write",
    riskLevel: "medium",
    requiresApproval: true,
    canRunInReadOnlyMode: false,
  },
  DeleteFile: {
    action: "delete",
    riskLevel: "high",
    requiresApproval: true,
    canRunInReadOnlyMode: false,
  },
  RunCommand: {
    action: "execute",
    riskLevel: "high",
    requiresApproval: true,
    canRunInReadOnlyMode: false,
  },
  NetworkRequest: {
    action: "network",
    riskLevel: "medium",
    requiresApproval: true,
    canRunInReadOnlyMode: true,
  },
};

export function getPolicyForTool(toolName: string): ExecutionPolicy {
  return (
    defaultPolicies[toolName] ?? {
      action: "execute",
      riskLevel: "medium",
      requiresApproval: true,
      canRunInReadOnlyMode: false,
    }
  );
}
