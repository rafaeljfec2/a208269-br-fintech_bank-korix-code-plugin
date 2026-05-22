import * as vscode from "vscode";
import type { Mode, ExecutionContext } from "../core/types";
import type { ContextEngine } from "../context/contextEngine";
import type {
  ExecutionCompleteEvent,
  RuntimeEvent,
} from "../core/runtime/runtimeEvents";
import type {
  EvidencePack,
  EvidenceRequest,
} from "../core/runtime/thinking";
import type { ApprovalRequest, ApprovalResponse } from "../harness/permissions";

export interface ChatParticipantMetadata {
  readonly mode: Mode;
  readonly command?: string;
}

export type ChatHistoryMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export interface ChatParticipantCompletionInput {
  readonly streamedText: string;
  readonly toolCallCount: number;
  readonly failedToolCount: number;
  readonly completion?: ExecutionCompleteEvent;
  readonly cancelled: boolean;
}

export const CHAT_COMMAND_MODES: Readonly<Record<string, Mode>> = {
  ask: "ask",
  plan: "plan",
  agent: "agent",
};

const CHAT_HISTORY_LIMIT = 16;

export function metadata(
  mode: Mode,
  command: string | undefined,
): ChatParticipantMetadata {
  return command ? { mode, command } : { mode };
}

export function addOpenPanelButton(response: vscode.ChatResponseStream): void {
  response.button({
    command: "korix.openSidebar",
    title: "Open Korix Code",
  });
}

export function forwardRuntimeEvent(
  event: RuntimeEvent,
  response: vscode.ChatResponseStream,
): string {
  switch (event.type) {
    case "token":
      response.markdown(event.content);
      return event.content;
    case "thinking_step":
      response.progress(event.item.title);
      return "";
    case "tool_call":
      response.progress(`Executando ${event.name}`);
      return "";
    case "tool_result":
      response.progress(
        `${event.name} ${event.success ? "concluída" : "falhou"}`,
      );
      return "";
    case "provider_request_start":
      response.progress("Aguardando modelo");
      return "";
    case "provider_first_output":
      response.progress(
        `Modelo começou a responder em ${(event.latency / 1000).toFixed(1)}s`,
      );
      return "";
    case "provider_request_end":
      response.progress(
        `Modelo concluiu em ${(event.duration / 1000).toFixed(1)}s`,
      );
      return "";
    case "response_validation":
      if (event.validation.status === "blocked") {
        response.progress(event.validation.summary);
      }
      return "";
    case "error":
      response.markdown(`\n\n${event.error}`);
      return event.error;
    default:
      return "";
  }
}

export function buildChatParticipantCompletionMarkdown(
  input: ChatParticipantCompletionInput,
): string | null {
  if (input.cancelled) {
    return "Execução cancelada pelo usuário.";
  }

  const totalToolCalls =
    input.completion?.metrics.totalToolCalls ?? input.toolCallCount;
  const shouldReport =
    input.streamedText.trim().length === 0 ||
    totalToolCalls > 0 ||
    input.failedToolCount > 0;

  if (!shouldReport) {
    return null;
  }

  const iterations = input.completion?.iterations ?? 0;
  const tokenCount = input.completion?.metrics.totalTokens ?? 0;
  const duration = input.completion?.metrics.duration
    ? input.completion.metrics.duration / 1000
    : 0;
  const iterationLabel = iterations === 1 ? "iteração" : "iterações";
  const toolLabel = totalToolCalls === 1 ? "ferramenta" : "ferramentas";
  const failureSuffix =
    input.failedToolCount > 0
      ? `, ${input.failedToolCount} com falha`
      : "";
  const status =
    input.completion && !input.completion.success
      ? "Finalizado com falha"
      : "Concluído";
  const prefix = input.streamedText.trim().length > 0 ? "\n\n" : "";

  if (!input.completion) {
    return `${prefix}${status}: ${totalToolCalls} ${toolLabel}${failureSuffix}.`;
  }

  return `${prefix}${status}: ${iterations} ${iterationLabel}, ${totalToolCalls} ${toolLabel}${failureSuffix}, ${tokenCount} tokens em ${duration.toFixed(1)}s.`;
}

export function buildExecutionContext(mode: Mode): ExecutionContext {
  const activeEditor = vscode.window.activeTextEditor;
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const openFiles = Array.from(vscode.workspace.textDocuments)
    .filter((document) => document.uri.scheme === "file")
    .map((document) => document.uri.fsPath);

  const selection = activeEditor?.selection;
  const selectedText = selection ? activeEditor.document.getText(selection) : "";

  return {
    mode,
    workspaceRoot,
    currentFile: activeEditor?.document.uri.fsPath,
    selection:
      selection && selectedText.length > 0
        ? {
            start: {
              line: selection.start.line,
              character: selection.start.character,
            },
            end: {
              line: selection.end.line,
              character: selection.end.character,
            },
            text: selectedText,
          }
        : undefined,
    openFiles,
  };
}

export async function buildEvidencePack(
  request: EvidenceRequest,
  contextEngine: ContextEngine,
): Promise<EvidencePack> {
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

  const contextWindow = await contextEngine.buildContext({
    currentFile: request.context.currentFile,
    userSelection:
      request.context.currentFile && range
        ? { file: request.context.currentFile, range }
        : undefined,
    mentionedSymbols: [...request.profile.mentionedSymbols],
    tokenBudget,
  });

  return {
    summary: `${contextWindow.items.length} workspace item(s), ${contextWindow.totalTokens} estimated tokens.`,
    providerContext: contextEngine.formatContext(contextWindow),
    items: contextWindow.items.map((item) => ({
      path: item.file,
      priority: item.priority,
      tokenCount: item.tokenCount,
    })),
    totalTokens: contextWindow.totalTokens,
  };
}

export function toPreviousMessages(
  chatContext: vscode.ChatContext,
): readonly ChatHistoryMessage[] {
  return chatContext.history
    .slice(-CHAT_HISTORY_LIMIT)
    .flatMap((turn): readonly ChatHistoryMessage[] => {
      if (isRequestTurn(turn)) {
        return [{ role: "user", content: turn.prompt }];
      }

      const content = responseTurnToText(turn);
      return content.trim().length > 0
        ? [{ role: "assistant", content }]
        : [];
    });
}

export async function requestApprovalInChat(
  request: ApprovalRequest,
  response: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<ApprovalResponse> {
  if (token.isCancellationRequested) {
    return { approved: false };
  }

  response.progress(`Approval required for ${request.tool}`);

  const description = compactPermissionDescription(request.description);
  const choice = await vscode.window.showWarningMessage(
    `${riskLabel(request.riskLevel)} Allow Korix to execute ${request.tool}? ${description}`,
    { modal: true },
    "Approve once",
    "Always allow",
    "Reject",
    "Never allow",
  );

  switch (choice) {
    case "Approve once":
      return { approved: true, level: "once" };
    case "Always allow":
      return { approved: true, remember: true, level: "always" };
    case "Never allow":
      return { approved: false, remember: true, level: "never" };
    case "Reject":
    default:
      return { approved: false };
  }
}

function isRequestTurn(
  turn: vscode.ChatRequestTurn | vscode.ChatResponseTurn,
): turn is vscode.ChatRequestTurn {
  return "prompt" in turn;
}

function responseTurnToText(turn: vscode.ChatResponseTurn): string {
  return turn.response
    .map((part) => responsePartToText(part))
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

function responsePartToText(
  part:
    | vscode.ChatResponseMarkdownPart
    | vscode.ChatResponseFileTreePart
    | vscode.ChatResponseAnchorPart
    | vscode.ChatResponseCommandButtonPart,
): string {
  if (part instanceof vscode.ChatResponseMarkdownPart) {
    return part.value.value;
  }

  if (part instanceof vscode.ChatResponseAnchorPart) {
    return part.title ?? anchorValueToText(part.value);
  }

  if (part instanceof vscode.ChatResponseCommandButtonPart) {
    return part.value.title ?? part.value.command;
  }

  if (part instanceof vscode.ChatResponseFileTreePart) {
    return "File tree response.";
  }

  return "";
}

function anchorValueToText(value: vscode.Uri | vscode.Location): string {
  if (value instanceof vscode.Uri) {
    return value.fsPath;
  }

  return value.uri.fsPath;
}

function compactPermissionDescription(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();

  if (compact.length === 0) {
    return "Review the tool request before continuing.";
  }

  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function riskLabel(riskLevel: ApprovalRequest["riskLevel"]): string {
  switch (riskLevel) {
    case "low":
      return "Low risk.";
    case "medium":
      return "Medium risk.";
    case "high":
      return "High risk.";
  }
}
