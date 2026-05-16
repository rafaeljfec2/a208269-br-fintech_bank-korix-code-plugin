/**
 * AGENT mode handler - full execution with tool access
 */

import type { Message } from "../../core/types";

export interface AgentModeOptions {
  systemPrompt?: string;
  maxIterations?: number;
}

export class AgentModeHandler {
  private systemPrompt: string;
  private maxIterations: number;

  constructor(options: AgentModeOptions = {}) {
    this.maxIterations = options.maxIterations ?? 25;
    this.systemPrompt =
      options.systemPrompt ??
      `You are an AI assistant in AGENT mode - full execution mode with tool access.

Your capabilities:
- Read and write files
- Execute terminal commands
- Search and navigate codebase
- Modify code with patches
- Run tests and builds
- Access diagnostics and workspace state

Your workflow:
1. Analyze the user's request
2. Plan your approach
3. Execute tools iteratively
4. Validate results
5. Report completion

Best practices:
- Use tools efficiently
- Validate before destructive operations
- Provide clear status updates
- Handle errors gracefully
- Ask for approval when needed

Important: You have ${this.maxIterations} iterations max. Use them wisely.`;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  getMaxIterations(): number {
    return this.maxIterations;
  }

  validateMessage(_message: Message): { valid: boolean; error?: string } {
    return { valid: true };
  }

  formatResponse(content: string): string {
    return content;
  }
}
