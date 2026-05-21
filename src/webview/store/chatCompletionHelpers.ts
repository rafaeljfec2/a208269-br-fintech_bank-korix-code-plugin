import type {
  ChatSession,
  Message,
  MessageMetadata,
} from "./slices/chatSlice";

const FALLBACK_COMPLETION_CONTENT =
  "Korix concluiu a execução. Preparando o resumo final com os detalhes abaixo.";

export function finalizeChatStreaming(chat: ChatSession): ChatSession {
  const message = buildFinalAssistantMessage(chat);

  return {
    ...chat,
    messages: message ? [...chat.messages, message] : chat.messages,
    streamingContent: "",
    isStreaming: false,
    isThinking: false,
  };
}

export function replaceFallbackAssistantContent(
  chat: ChatSession,
  content: string,
): ChatSession | null {
  const lastAssistantIndex = [...chat.messages]
    .reverse()
    .findIndex((message) => message.role === "assistant");

  if (lastAssistantIndex === -1) {
    return null;
  }

  const messageIndex = chat.messages.length - 1 - lastAssistantIndex;
  const message = chat.messages[messageIndex];

  if (!message?.metadata?.runtimeFallback) {
    return null;
  }

  return {
    ...chat,
    messages: chat.messages.map((item, index) =>
      index === messageIndex
        ? {
            ...item,
            content,
            metadata: {
              ...item.metadata,
              runtimeFallback: false,
            },
          }
        : item,
    ),
  };
}

function buildFinalAssistantMessage(chat: ChatSession): Message | null {
  const hasStreamingContent = chat.streamingContent.trim().length > 0;
  const activeThinkingItems = chat.activeThinkingItems ?? [];
  const activeMessageTools = chat.activeMessageTools ?? [];
  const hasRuntimeDetails =
    activeThinkingItems.length > 0 || activeMessageTools.length > 0;
  const shouldCreateFallback = !hasStreamingContent && hasRuntimeDetails;
  const content = hasStreamingContent
    ? chat.streamingContent
    : shouldCreateFallback
      ? FALLBACK_COMPLETION_CONTENT
      : "";

  if (content.length === 0) {
    return null;
  }

  const totalDuration = activeMessageTools.reduce(
    (sum, tool) => sum + tool.duration,
    0,
  );

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    timestamp: Date.now(),
    metadata: buildCompletionMetadata(
      shouldCreateFallback,
      activeThinkingItems,
      activeMessageTools,
      totalDuration,
    ),
  };
}

function buildCompletionMetadata(
  runtimeFallback: boolean,
  activeThinkingItems: ChatSession["activeThinkingItems"],
  activeMessageTools: ChatSession["activeMessageTools"],
  totalDuration: number,
): MessageMetadata {
  return {
    ...(runtimeFallback ? { runtimeFallback: true } : {}),
    ...(activeThinkingItems && activeThinkingItems.length > 0
      ? {
          thinking: {
            items: activeThinkingItems,
            isExpanded: false,
          },
        }
      : {}),
    ...(activeMessageTools && activeMessageTools.length > 0
      ? {
          execution: {
            tools: activeMessageTools,
            isExpanded: false,
            totalDuration,
          },
        }
      : {}),
  };
}
