/**
 * Chat slice - multiple conversations with streaming state
 */

import type { StateCreator } from "zustand";

export interface ToolExecution {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: "success" | "error" | "pending";
  readonly duration: number; // ms
  readonly timestamp: number;
}

export interface MessageMetadata {
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
  readonly question?: {
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
    readonly onSubmit: (answers: string[]) => void;
    readonly onTimeout?: () => void;
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
  readonly removeQuestionFromMessage: (
    chatId: string,
    messageId: string,
  ) => void;
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
      const chat = state.conversations[chatId];
      if (!chat || !chat.streamingContent) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: [
              ...chat.messages,
              {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: chat.streamingContent,
                timestamp: Date.now(),
              },
            ],
            streamingContent: "",
            isStreaming: false,
          },
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
      if (!chat || !chat.thinkingContent) return state;

      // Adicionar thinking block como mensagem do sistema
      const thinkingMessage: Message = {
        id: crypto.randomUUID(),
        role: "system" as const,
        content: chat.thinkingContent,
        timestamp: Date.now(),
        metadata: {
          statusCard: {
            type: "plan_created" as const,
            title: "Raciocínio",
            subtitle: "Modelo processou o contexto",
          },
        },
      };

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: [...chat.messages, thinkingMessage],
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

  removeQuestionFromMessage: (chatId, messageId) =>
    set((state: ChatSlice) => {
      const chat = state.conversations[chatId];
      if (!chat) return state;

      return {
        conversations: {
          ...state.conversations,
          [chatId]: {
            ...chat,
            messages: chat.messages.map((msg) =>
              msg.id === messageId
                ? {
                    ...msg,
                    metadata: {
                      ...msg.metadata,
                      question: undefined,
                    },
                  }
                : msg,
            ),
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
