/**
 * Permission system for tool execution with allowlist/denylist
 */

import * as vscode from "vscode";

export type PermissionLevel = "always" | "once" | "never" | "ask";

export interface PermissionRule {
  tool: string;
  level: PermissionLevel;
  pattern?: string;
  expiresAt?: number;
}

export interface ApprovalRequest {
  tool: string;
  input: unknown;
  description: string;
  riskLevel: "low" | "medium" | "high";
}

export interface ApprovalResponse {
  approved: boolean;
  remember?: boolean;
  level?: PermissionLevel;
}

export class PermissionManager {
  private rules: Map<string, PermissionRule> = new Map();
  private denylist: Set<string> = new Set();

  constructor() {
    this.loadDefaultDenylist();
  }

  private loadDefaultDenylist(): void {
    // Default blocked tools/patterns
    this.denylist.add("rm -rf");
    this.denylist.add("sudo");
    this.denylist.add("curl | bash");
    this.denylist.add("wget | sh");
    this.denylist.add(":(){ :|:& };:"); // Fork bomb
    this.denylist.add("dd if=/dev/zero");
    this.denylist.add("mkfs");
    this.denylist.add("fdisk");
  }

  addRule(rule: PermissionRule): void {
    this.rules.set(rule.tool, rule);
  }

  getRule(tool: string): PermissionRule | undefined {
    return this.rules.get(tool);
  }

  removeRule(tool: string): boolean {
    return this.rules.delete(tool);
  }

  clearExpiredRules(): void {
    const now = Date.now();
    for (const [tool, rule] of this.rules.entries()) {
      if (rule.expiresAt && rule.expiresAt < now) {
        this.rules.delete(tool);
      }
    }
  }

  isBlocked(tool: string, input?: unknown): boolean {
    // Check denylist
    const inputStr = typeof input === "string" ? input : JSON.stringify(input);

    for (const pattern of this.denylist) {
      if (tool.includes(pattern) || inputStr.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  async checkPermission(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Check if blocked
    if (this.isBlocked(request.tool, request.input)) {
      return { approved: false };
    }

    // Clear expired rules
    this.clearExpiredRules();

    // Check existing rule
    const rule = this.rules.get(request.tool);

    if (rule) {
      switch (rule.level) {
        case "always":
          return { approved: true };
        case "never":
          return { approved: false };
        case "once":
          this.rules.delete(request.tool);
          return { approved: true };
        case "ask":
          break;
      }
    }

    // Ask user for approval
    return await this.promptUser(request);
  }

  private async promptUser(
    request: ApprovalRequest,
  ): Promise<ApprovalResponse> {
    const riskEmoji = {
      low: "✅",
      medium: "⚠️",
      high: "🔴",
    };

    const message = `${riskEmoji[request.riskLevel]} Korix wants to execute: ${request.tool}`;
    const detail = request.description;

    const choice = await vscode.window.showWarningMessage(
      message,
      {
        modal: true,
        detail,
      },
      "Approve Once",
      "Always Allow",
      "Reject",
      "Never Allow",
    );

    switch (choice) {
      case "Approve Once":
        return { approved: true, level: "once" };

      case "Always Allow":
        this.addRule({ tool: request.tool, level: "always" });
        return { approved: true, remember: true, level: "always" };

      case "Never Allow":
        this.addRule({ tool: request.tool, level: "never" });
        return { approved: false, remember: true, level: "never" };

      case "Reject":
      default:
        return { approved: false };
    }
  }

  async requestApproval(
    tool: string,
    input: unknown,
    description: string,
    riskLevel: "low" | "medium" | "high" = "medium",
  ): Promise<boolean> {
    const response = await this.checkPermission({
      tool,
      input,
      description,
      riskLevel,
    });

    return response.approved;
  }

  exportRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }

  importRules(rules: PermissionRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  reset(): void {
    this.rules.clear();
  }
}

export const globalPermissionManager = new PermissionManager();
