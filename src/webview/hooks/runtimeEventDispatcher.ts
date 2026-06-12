import type { ExtensionToWebviewMessage } from "../../shared/protocol";
import type {
  ThinkingTimelineItem,
} from "../store/slices/chatSlice";
import type { useStore } from "../store";
import { logger } from "../utils/logger";
import { handleExecutionEvent } from "./runtimeHandlers/execution";
import { handleProviderEvent } from "./runtimeHandlers/provider";
import { handleToolsEvent } from "./runtimeHandlers/tools";
import { handleCheckpointEvent } from "./runtimeHandlers/checkpoint";
import { handleUserEvent } from "./runtimeHandlers/user";

export type RuntimeEvent = Extract<
  ExtensionToWebviewMessage,
  { type: "runtime_event" }
>["payload"]["event"];

export type AgentEventStatus = ThinkingTimelineItem["status"];

export interface AgentEventListInput {
  readonly stage: string;
  readonly title: string;
  readonly summary?: string;
  readonly status?: AgentEventStatus;
  readonly timestamp?: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BatchEvidenceDisplay {
  readonly summary: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RuntimeEventContext {
  store: ReturnType<typeof useStore.getState>;
  currentActivityContextId: string | null;
  setCurrentActivityContextId: (id: string | null) => void;
  lastCompletedChatId: string | null;
  setLastCompletedChatId: (id: string | null) => void;
  responseStreamingNoted: boolean;
  setResponseStreamingNoted: (noted: boolean) => void;
  eventListCounter: number;
  incrementEventListCounter: () => number;
  bufferToken: (chatId: string, token: string) => void;
  flushTokens: () => void;
}

export function createEventListItem(
  input: AgentEventListInput,
  ctx: RuntimeEventContext,
): ThinkingTimelineItem {
  const nextCounter = ctx.incrementEventListCounter();
  return {
    id: `agent-event-${Date.now()}-${nextCounter}`,
    stage: input.stage,
    title: input.title,
    summary: input.summary ?? "",
    status: input.status ?? "success",
    timestamp: input.timestamp ?? Date.now(),
    durationMs: input.durationMs,
    metadata: input.metadata,
  };
}

export function addActiveEventItem(
  input: AgentEventListInput,
  ctx: RuntimeEventContext,
): string {
  const chatId =
    ctx.store.activeChatId ?? ctx.store.createChat("Nova conversa");
  ctx.store.addActiveThinkingItem(chatId, createEventListItem(input, ctx));
  return chatId;
}

export function appendCompletedEventItem(
  chatId: string | null,
  input: AgentEventListInput,
  ctx: RuntimeEventContext,
): void {
  if (!chatId) {
    return;
  }
  ctx.store.appendThinkingItemToLastAssistant(
    chatId,
    createEventListItem(input, ctx),
  );
}

export function dispatchRuntimeEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): void {
  // Try each handler category
  if (handleExecutionEvent(event, ctx)) return;
  if (handleProviderEvent(event, ctx)) return;
  if (handleToolsEvent(event, ctx)) return;
  if (handleCheckpointEvent(event, ctx)) return;
  if (handleUserEvent(event, ctx)) return;

  // Unhandled event
  logger.warn("[RuntimeEvents] Unhandled event type:", event);
}

export function getBatchEvidenceDisplay(
  result: unknown,
): BatchEvidenceDisplay | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const files = Array.isArray(result.files) ? result.files : [];
  const omittedFiles = Array.isArray(result.omittedFiles)
    ? result.omittedFiles
    : [];

  return {
    summary: `Collected ${files.length} file(s), omitted ${omittedFiles.length} file(s).`,
    metadata: {
      fileCount: files.length,
      omittedCount: omittedFiles.length,
    },
  };
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
