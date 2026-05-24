import * as vscode from "vscode";
import type { ContextEngine } from "../../context/contextEngine";
import type {
  EvidencePack,
  EvidenceRequest,
} from "../../core/runtime/thinking";
import type { ContextIR } from "@korix/context-compiler";

export class AgentEvidencePackBuilder {
  constructor(
    private readonly contextEngine: Pick<
      ContextEngine,
      "buildContextIr" | "formatContextIr"
    >,
    private readonly recordContextIr: (contextIr: ContextIR) => void,
  ) {}

  async build(request: EvidenceRequest): Promise<EvidencePack> {
    const tokenBudget = Math.min(
      vscode.workspace
        .getConfiguration("korix")
        .get<number>("contextTokenBudget", 180000),
      24000,
    );

    const range = request.context.selection
      ? new vscode.Range(
          request.context.selection.start.line,
          request.context.selection.start.character,
          request.context.selection.end.line,
          request.context.selection.end.character,
        )
      : undefined;

    const contextIr = await this.contextEngine.buildContextIr({
      userPrompt: request.message,
      workspaceRoot: request.context.workspaceRoot,
      currentFile: request.context.currentFile,
      openFiles: request.context.openFiles,
      userSelection:
        request.context.currentFile && range
          ? { file: request.context.currentFile, range }
          : undefined,
      mentionedSymbols: [...request.profile.mentionedSymbols],
      tokenBudget,
    });
    this.recordContextIr(contextIr);

    return {
      summary: `${contextIr.context.files.length} workspace item(s), ${contextIr.budget.estimatedTokens} estimated tokens.`,
      providerContext: this.contextEngine.formatContextIr(contextIr),
      items: contextIr.context.files.map((item) => ({
        path: item.path,
        priority: item.score,
        tokenCount: item.estimatedTokens,
      })),
      totalTokens: contextIr.budget.estimatedTokens,
    };
  }
}
