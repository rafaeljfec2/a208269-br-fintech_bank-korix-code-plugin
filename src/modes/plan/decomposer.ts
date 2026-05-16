/**
 * PLAN mode handler - task decomposition and planning
 */

import type { Message } from "../../core/types";

export interface PlanModeOptions {
  systemPrompt?: string;
}

export interface TaskBreakdown {
  tasks: Array<{
    id: string;
    description: string;
    dependencies: string[];
    estimatedComplexity: "low" | "medium" | "high";
  }>;
  totalEstimatedTime?: string;
  risks?: string[];
}

export class PlanModeHandler {
  private systemPrompt: string;

  constructor(options: PlanModeOptions = {}) {
    this.systemPrompt =
      options.systemPrompt ??
      `You are an AI assistant in PLAN mode - a planning and decomposition mode.

Your capabilities:
- Read and analyze code structure
- Decompose tasks into subtasks
- Create implementation roadmaps
- Analyze impact of changes
- Identify dependencies and risks
- Suggest architectural approaches

Your restrictions:
- NO file modifications
- NO command execution
- NO side effects
- Focus on PLANNING, not execution

Output format:
Provide structured plans with:
1. Task breakdown with dependencies
2. Implementation steps
3. Risk analysis
4. Estimated complexity

Your plans should be actionable and detailed.`;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  validateMessage(_message: Message): { valid: boolean; error?: string } {
    return { valid: true };
  }

  parseTaskBreakdown(content: string): TaskBreakdown | null {
    try {
      // Try to parse JSON task breakdown if provided
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch?.[1]) {
        return JSON.parse(jsonMatch[1]) as TaskBreakdown;
      }
    } catch {
      // If parsing fails, return null
    }
    return null;
  }

  formatResponse(content: string): string {
    return content;
  }
}
