/**
 * Chat slice - multiple conversations with streaming state
 */

import type { StateCreator } from "zustand";
import { logger } from "../../utils/logger";

export interface ToolExecution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: "success" | "error" | "pending";
  readonly duration: number; // ms
  readonly timestamp: number;
}

export interface ThinkingTimelineItem {
  readonly id: string;
  readonly stage: string;
  readonly title: string;
  readonly summary: string;
  readonly status: "pending" | "success" | "warning" | "error";
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MessageMetadata {
  readonly thinking?: {
    readonly items: readonly ThinkingTimelineItem[];
    readonly isExpanded: boolean;
  };
  readonly execution?: {
    readonly tools: ToolExecution[];
    readonly isExpanded: boolean;
    readonly totalDuration: number;
  };
  readonly statusCard?: {
    readonly type: "plan_created" | "completed" | "error";
    readonly title: string;
    readonly subtitle?: string;
    readonly action?: {
      readonly label: string;
      readonly onClick: () => void;
    };
  };
}

export interface Message {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly timestamp: number;
  readonly isStreaming?: boolean;
  readonly metadata?: MessageMetadata;
}

export interface ActiveQuestion {
  readonly questionId: string;
  readonly title: string;
  readonly question: string;
  readonly mode: "single" | "multiple";
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly description: string;
  }[];
  readonly timeoutMs?: number;
  readonly defaultAnswer?: string | string[];
}

export interface ChatSession {
  readonly id: string;
  readonly title: string;
  readonly messages: Message[];
  readonly streamingContent: string;
  readonly isStreaming: boolean;
  readonly createdAt: number;
  readonly thinkingContent?: string;
  readonly isThinking?: boolean;
  readonly activeMessageTools?: ToolExecution[];
  readonly activeThinkingItems?: ThinkingTimelineItem[];
}

export interface ChatSlice {
  readonly conversations: Record<string, ChatSession>;
  readonly activeChatId: string | null;
  readonly activeQuestion: ActiveQuestion | null;
  readonly sidebarVisible: boolean;
  readonly sidebarWidth: number;

  // Actions
  readonly createChat: (title?: string) => string;
  readonly switchChat: (chatId: string) => void;
  readonly closeChat: (chatId: string) => void;
  readonly updateChatTitle: (chatId: string, title: string) => void;
  readonly addMessage: (
    chatId: string,
    message: Omit<Message, "id" | "timestamp">,
  ) => string;
  readonly appendStreamingToken: (chatId: string, token: string) => void;
  readonly finalizeStreaming: (chatId: string) => void;
  readonly clearChat: (chatId: string) => void;
  readonly updateActiveMessageMetadata: (
    chatId: string,
    metadata: Partial<MessageMetadata>,
  ) => void;
  readonly appendThinkingToken: (chatId: string, token: string) => void;
  readonly finalizeThinking: (chatId: string) => void;
  readonly addActiveMessageTool: (chatId: string, tool: ToolExecution) => void;
  readonly updateActiveMessageTool: (
    chatId: string,
    toolId: string,
    updates: Partial<ToolExecution>,
  ) => void;
  readonly clearActiveMessageTools: (chatId: string) => void;
  readonly addActiveThinkingItem: (
    chatId: string,
    item: ThinkingTimelineItem,
  ) => void;
  readonly appendThinkingItemToLastAssistant: (
    chatId: string,
    item: ThinkingTimelineItem,
  ) => void;
  readonly clearActiveThinkingItems: (chatId: string) => void;
  readonly setActiveQuestion: (question: ActiveQuestion) => void;
  readonly clearActiveQuestion: () => void;
  readonly toggleSidebar: () => void;
  readonly setSidebarWidth: (width: number) => void;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (
  set,
) => ({
  conversations: {},
  activeChatId: null,
  activeQuestion: null,
  sidebarVisible: false,
  sidebarWidth: 450,

  createChat: (title = "Nova conversa") => {
    const chatId = crypto.randomUUID();

    set((state: ChatSlice) => ({
      conversations: {
        ...state.conversations,
        [chatId]: {
          id: chatId,
          title,
          messages: [],
          streamingContent: "",
          isStreaming: false,
          createdAt: Date.now(),
        },
      },
      activeChatId: chatId,
    }));

    return chatId;
  },

  switchChat: (chatId) =>
    set((state: ChatSlice) => {
      if (!state.conversations[chatId]) {
        console.warn(`Chat ${chatId} not found`);
        return state;
      }

      return { activeChatId: chatId };
    }),

  closeChat: (chatId) =>
    set((state: ChatSlice) => {
      const { [chatId]: removed, ...remaining } = state.conversations;

      // Se fechou a conversa ativa, troca para outra ou null
      let newActiveChatId = state.activeChatId;
      if (state.activeChatId === chatId) {
        const remainingIds = Object.keys(remaining);
        newActiveChatId =
          remainingIds.length > 0 ? (remainingIds[0] ?? null) : null;
      }

      return {
        conversations: remaining,
        activeChatId: newActiveChatId,
      };
    }),

  updateChatTitle: (chatId, title) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            title,
          },
        },
      };
    }),

  addMessage: (chatId, message) => {
    const messageId = crypto.randomUUID();

    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found`);
        return state;
      }

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: [
              ...chat.messages,
              {
                ...message,
                id: messageId,
                timestamp: Date.now(),
              },
            ],
          },
        },
      };
    });

    return messageId;
  },

  appendStreamingToken: (chatId, token) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found`);
        return state;
      }

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            streamingContent: chat.streamingContent + token,
            isStreaming: true,
          },
        },
      };
    }),

  finalizeStreaming: (chatId) =>
    set((state: ChatSlice) => {
      logger.log("[ChatSlice] finalizeStreaming called", { chatId });

      const chat = state.conversations[chatId];
      if (!chat) {
        logger.warn("[ChatSlice] finalizeStreaming: chat not found", {
          chatId,
        });
        return state;
      }

      logger.log("[ChatSlice] Current streaming state", {
        isStreaming: chat.isStreaming,
        streamingContentLength: chat.streamingContent.length,
        isThinking: chat.isThinking,
      });

      // ALWAYS clear isStreaming, even if streamingContent is empty
      // to prevent "Digitando..." from getting stuck
      const updatedChat = {
        ...chat,
        streamingContent: "",
        isStreaming: false,
        isThinking: false,
      };

      // Only add a new message if there was actual streaming content
      if (chat.streamingContent && chat.streamingContent.trim().length > 0) {
        const totalDuration = (chat.activeMessageTools ?? []).reduce(
          (sum, tool) => sum + tool.duration,
          0,
        );

        updatedChat.messages = [
          ...chat.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: chat.streamingContent,
            timestamp: Date.now(),
            metadata: {
              ...(chat.activeThinkingItems &&
              chat.activeThinkingItems.length > 0
                ? {
                    thinking: {
                      items: chat.activeThinkingItems,
                      isExpanded: false,
                    },
                  }
                : {}),
              ...(chat.activeMessageTools && chat.activeMessageTools.length > 0
                ? {
                    execution: {
                      tools: chat.activeMessageTools,
                      isExpanded: false,
                      totalDuration,
                    },
                  }
                : {}),
            },
          },
        ];
        logger.log("[ChatSlice] Added assistant message", {
          contentLength: chat.streamingContent.length,
        });
      } else {
        logger.log("[ChatSlice] No streaming content to add as message");
      }

      logger.log("[ChatSlice] finalizeStreaming complete", {
        isStreaming: updatedChat.isStreaming,
        messageCount: updatedChat.messages.length,
      });

      return {
        conversations: {
          ...state.conversations,
          [chatId]: updatedChat,
        },
      };
    }),

  appendThinkingToken: (chatId, token) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found`);
        return state;
      }

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            thinkingContent: (chat.thinkingContent ?? "") + token,
            isThinking: true,
          },
        },
      };
    }),

  finalizeThinking: (chatId) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            thinkingContent: "",
            isThinking: false,
          },
        },
      };
    }),

  clearChat: (chatId) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: [],
            streamingContent: "",
            isStreaming: false,
          },
        },
      };
    }),

  updateActiveMessageMetadata: (chatId, metadata) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat || chat.messages.length === 0) return state;

      const lastMessage = chat.messages[chat.messages.length - 1];
      if (!lastMessage || lastMessage.role !== "assistant") return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: chat.messages.map((msg, i) =>
              i === chat.messages.length - 1
                ? { ...msg, metadata: { ...msg.metadata, ...metadata } }
                : msg,
            ),
          },
        },
      };
    }),

  addActiveMessageTool: (chatId, tool) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      const tools = [...(chat.activeMessageTools ?? []), tool];

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            activeMessageTools: tools,
          },
        },
      };
    }),

  updateActiveMessageTool: (chatId, toolId, updates) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat || !chat.activeMessageTools) return state;

      const tools = chat.activeMessageTools.map((t) =>
        t.id === toolId ? { ...t, ...updates } : t,
      );

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            activeMessageTools: tools,
          },
        },
      };
    }),

  clearActiveMessageTools: (chatId) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            activeMessageTools: undefined,
          },
        },
      };
    }),

  addActiveThinkingItem: (chatId, item) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            activeThinkingItems: [...(chat.activeThinkingItems ?? []), item],
          },
        },
      };
    }),

  appendThinkingItemToLastAssistant: (chatId, item) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      const lastAssistantIndex = [...chat.messages]
        .reverse()
        .findIndex((message) => message.role === "assistant");

      if (lastAssistantIndex === -1) return state;

      const messageIndex = chat.messages.length - 1 - lastAssistantIndex;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: chat.messages.map((message, index) => {
              if (index !== messageIndex) {
                return message;
              }

              const existingItems = message.metadata?.thinking?.items ?? [];

              return {
                ...message,
                metadata: {
                  ...message.metadata,
                  thinking: {
                    items: [...existingItems, item],
                    isExpanded: message.metadata?.thinking?.isExpanded ?? false,
                  },
                },
              };
            }),
          },
        },
      };
    }),

  clearActiveThinkingItems: (chatId) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            activeThinkingItems: undefined,
          },
        },
      };
    }),

  setActiveQuestion: (question) =>
    set(() => ({
      activeQuestion: question,
    })),

  clearActiveQuestion: () =>
    set(() => ({
      activeQuestion: null,
    })),

  toggleSidebar: () =>
    set((state: ChatSlice) => ({
      sidebarVisible: !state.sidebarVisible,
    })),

  setSidebarWidth: (width) =>
    set(() => ({
      sidebarWidth: Math.max(200, Math.min(500, width)),
    })),
});
