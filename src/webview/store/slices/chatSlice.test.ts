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

    it("should create a fallback assistant message when tools ran without final text", () => {
      const { addActiveThinkingItem, addActiveMessageTool, finalizeStreaming } =
        store.getState();

      addActiveThinkingItem(chatId, {
        id: "event-1",
        stage: "tool_call",
        title: "Write openFile.ts",
        summary: "Tool execution requested by the agent loop.",
        status: "pending",
        timestamp: 123,
      });
      addActiveMessageTool(chatId, {
        id: "tool-1",
        name: "WriteFile",
        description: "Write openFile.ts",
        status: "success",
        duration: 12,
        timestamp: 124,
      });

      finalizeStreaming(chatId);

      const state = store.getState();
      const chat = state.conversations[chatId];
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0]?.role).toBe("assistant");
      expect(chat?.messages[0]?.metadata?.runtimeFallback).toBe(true);
      expect(chat?.messages[0]?.metadata?.thinking?.items).toHaveLength(1);
      expect(chat?.messages[0]?.metadata?.execution?.tools).toHaveLength(1);
    });

    it("should replace fallback assistant content with the final summary", () => {
      const {
        addActiveThinkingItem,
        finalizeStreaming,
        replaceLastAssistantFallbackContent,
      } = store.getState();

      addActiveThinkingItem(chatId, {
        id: "event-1",
        stage: "done",
        title: "Provider turn completed",
        summary: "Final response stream is ready to commit.",
        status: "success",
        timestamp: 123,
      });

      finalizeStreaming(chatId);
      replaceLastAssistantFallbackContent(
        chatId,
        "Concluído: 1 iteração, 2 ferramentas, 10 tokens em 1.2s.",
      );

      const chat = store.getState().conversations[chatId];
      expect(chat?.messages[0]?.content).toBe(
        "Concluído: 1 iteração, 2 ferramentas, 10 tokens em 1.2s.",
      );
      expect(chat?.messages[0]?.metadata?.runtimeFallback).toBe(false);
    });

    it("should not duplicate fallback assistant messages on repeated finalization", () => {
      const { addActiveThinkingItem, finalizeStreaming } = store.getState();

      addActiveThinkingItem(chatId, {
        id: "event-1",
        stage: "done",
        title: "Provider turn completed",
        summary: "Final response stream is ready to commit.",
        status: "success",
        timestamp: 123,
      });

      finalizeStreaming(chatId);
      finalizeStreaming(chatId);

      const chat = store.getState().conversations[chatId];
      expect(chat?.messages).toHaveLength(1);
      expect(chat?.messages[0]?.metadata?.runtimeFallback).toBe(true);
    });
  });

  describe("thinking timeline", () => {
    it("should append thinking event to the last assistant message", () => {
      const { addMessage, appendThinkingItemToLastAssistant } =
        store.getState();

      addMessage(chatId, { role: "user", content: "Hello" });
      addMessage(chatId, { role: "assistant", content: "Hi" });

      appendThinkingItemToLastAssistant(chatId, {
        id: "event-1",
        stage: "execution_complete",
        title: "Execution completed",
        summary: "1 iteration(s), 0 tool call(s), 32 token(s).",
        status: "success",
        timestamp: 123,
      });

      const state = store.getState();
      const chat = state.conversations[chatId];
      const assistantMessage = chat?.messages[1];

      expect(assistantMessage?.metadata?.thinking?.items).toHaveLength(1);
      expect(assistantMessage?.metadata?.thinking?.items[0]?.title).toBe(
        "Execution completed",
      );
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
