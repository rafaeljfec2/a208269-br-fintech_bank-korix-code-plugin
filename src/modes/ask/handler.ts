/**
 * ASK mode handler - read-only analysis and explanations
 */

import type { Message } from "../../core/types";

export interface AskModeOptions {
  systemPrompt?: string;
}

export class AskModeHandler {
  private systemPrompt: string;

  constructor(options: AskModeOptions = {}) {
    this.systemPrompt =
      options.systemPrompt ??
      `You are an AI assistant in ASK mode - a read-only analysis mode.

Your capabilities:
- Read and analyze code files
- Explain code functionality and architecture
- Answer questions about the codebase
- Provide suggestions and recommendations
- Search for symbols and references

Your restrictions:
- NO file modifications
- NO command execution
- NO side effects
- Read-only tools ONLY

Focus on providing clear, helpful explanations and analysis.`;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  validateMessage(_message: Message): { valid: boolean; error?: string } {
    // ASK mode allows all read-only operations
    return { valid: true };
  }

  formatResponse(content: string): string {
    return content;
  }
}
