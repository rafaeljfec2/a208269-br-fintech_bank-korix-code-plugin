/**
 * Chat slice - multiple conversations with streaming state
 */

import type { StateCreator } from 'zustand';

export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: number;
  readonly isStreaming?: boolean;
}

export interface ChatSession {
  readonly id: string;
  readonly title: string;
  readonly messages: Message[];
  readonly streamingContent: string;
  readonly isStreaming: boolean;
  readonly createdAt: number;
}

export interface ChatSlice {
  readonly conversations: Record<string, ChatSession>;
  readonly activeChatId: string | null;

  // Actions
  readonly createChat: (title?: string) => string;
  readonly switchChat: (chatId: string) => void;
  readonly closeChat: (chatId: string) => void;
  readonly updateChatTitle: (chatId: string, title: string) => void;
  readonly addMessage: (chatId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  readonly appendStreamingToken: (chatId: string, token: string) => void;
  readonly finalizeStreaming: (chatId: string) => void;
  readonly clearChat: (chatId: string) => void;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (set) => ({
  conversations: {},
  activeChatId: null,

  createChat: (title = 'Nova conversa') => {
    const chatId = crypto.randomUUID();

    set((state: ChatSlice) => ({
      conversations: {
        ...state.conversations,
        [chatId]: {
          id: chatId,
          title,
          messages: [],
          streamingContent: '',
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
        newActiveChatId = remainingIds.length > 0 ? remainingIds[0] : null;
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

  addMessage: (chatId, message) =>
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
                id: crypto.randomUUID(),
                timestamp: Date.now(),
              },
            ],
          },
        },
      };
    }),

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
                role: 'assistant' as const,
                content: chat.streamingContent,
                timestamp: Date.now(),
              },
            ],
            streamingContent: '',
            isStreaming: false,
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
            streamingContent: '',
            isStreaming: false,
          },
        },
      };
    }),
});
