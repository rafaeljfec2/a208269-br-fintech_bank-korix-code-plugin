/**
 * Chat slice - messages and streaming state
 */

import type { StateCreator } from 'zustand';

export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: number;
  readonly isStreaming?: boolean;
}

export interface ChatSlice {
  readonly messages: Message[];
  readonly streamingContent: string;
  readonly isStreaming: boolean;
  
  // Actions
  readonly addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  readonly appendStreamingToken: (token: string) => void;
  readonly finalizeStreaming: () => void;
  readonly clearChat: () => void;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (set) => ({
  messages: [],
  streamingContent: '',
  isStreaming: false,

  addMessage: (message) =>
    set((state: ChatSlice) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  appendStreamingToken: (token) =>
    set((state: ChatSlice) => ({
      streamingContent: state.streamingContent + token,
      isStreaming: true,
    })),

  finalizeStreaming: () =>
    set((state: ChatSlice) => {
      if (!state.streamingContent) return state;

      return {
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: state.streamingContent,
            timestamp: Date.now(),
          },
        ],
        streamingContent: '',
        isStreaming: false,
      };
    }),

  clearChat: () =>
    set({
      messages: [],
      streamingContent: '',
      isStreaming: false,
    }),
});
