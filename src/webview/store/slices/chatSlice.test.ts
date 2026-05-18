/**
 * Chat slice tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createChatSlice, type ChatSlice } from "./chatSlice";

describe("chatSlice", () => {
  let store: ReturnType<typeof create<ChatSlice>>;
  let chatId: string;

  beforeEach(() => {
    store = create<ChatSlice>(createChatSlice);
    // Create a chat before each test
    chatId = store.getState().createChat("Test Chat");
  });

  describe("addMessage", () => {
    it("should add message with generated id and timestamp", () => {
      const { addMessage } = store.getState();

      addMessage(chatId, { role: "user", content: "Hello" });

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0]?.content).toBe("Hello");
      expect(chat?.messages[0]?.role).toBe("user");
      expect(chat?.messages[0]?.id).toBeDefined();
      expect(chat?.messages[0]?.timestamp).toBeGreaterThan(0);
    });

    it("should append multiple messages", () => {
      const { addMessage } = store.getState();

      addMessage(chatId, { role: "user", content: "First" });
      addMessage(chatId, { role: "assistant", content: "Second" });

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(2);
      expect(chat?.messages[0]?.content).toBe("First");
      expect(chat?.messages[1]?.content).toBe("Second");
    });
  });

  describe("streaming", () => {
    it("should append streaming tokens", () => {
      const { appendStreamingToken } = store.getState();

      appendStreamingToken(chatId, "Hello");
      appendStreamingToken(chatId, " ");
      appendStreamingToken(chatId, "World");

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.streamingContent).toBe("Hello World");
      expect(chat?.isStreaming).toBe(true);
    });

    it("should finalize streaming as assistant message", () => {
      const { appendStreamingToken, finalizeStreaming } = store.getState();

      appendStreamingToken(chatId, "Streaming content");
      finalizeStreaming(chatId);

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0]?.role).toBe("assistant");
      expect(chat?.messages[0]?.content).toBe("Streaming content");
      expect(chat?.streamingContent).toBe("");
      expect(chat?.isStreaming).toBe(false);
    });

    it("should not finalize if streamingContent is empty", () => {
      const { finalizeStreaming } = store.getState();

      // No streaming content
      finalizeStreaming(chatId);

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(0);
    });
  });

  describe("clearChat", () => {
    it("should clear all messages and streaming state", () => {
      const { addMessage, appendStreamingToken, clearChat } = store.getState();

      addMessage(chatId, { role: "user", content: "Hello" });
      appendStreamingToken(chatId, "Streaming");

      clearChat(chatId);

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(0);
      expect(chat?.streamingContent).toBe("");
      expect(chat?.isStreaming).toBe(false);
    });
  });
});
