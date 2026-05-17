/**
 * Chat slice tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createChatSlice, type ChatSlice } from "./chatSlice";

describe("chatSlice", () => {
  let store: ReturnType<typeof create<ChatSlice>>;

  beforeEach(() => {
    store = create<ChatSlice>(createChatSlice);
  });

  describe("addMessage", () => {
    it("should add message with generated id and timestamp", () => {
      const { addMessage, messages } = store.getState();

      addMessage({ role: "user", content: "Hello" });

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.content).toBe("Hello");
      expect(state.messages[0]?.role).toBe("user");
      expect(state.messages[0]?.id).toBeDefined();
      expect(state.messages[0]?.timestamp).toBeGreaterThan(0);
    });

    it("should append multiple messages", () => {
      const { addMessage } = store.getState();

      addMessage({ role: "user", content: "First" });
      addMessage({ role: "assistant", content: "Second" });

      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]?.content).toBe("First");
      expect(state.messages[1]?.content).toBe("Second");
    });
  });

  describe("streaming", () => {
    it("should append streaming tokens", () => {
      const { appendStreamingToken } = store.getState();

      appendStreamingToken("Hello");
      appendStreamingToken(" ");
      appendStreamingToken("World");

      const state = store.getState();
      expect(state.streamingContent).toBe("Hello World");
      expect(state.isStreaming).toBe(true);
    });

    it("should finalize streaming as assistant message", () => {
      const { appendStreamingToken, finalizeStreaming } = store.getState();

      appendStreamingToken("Streaming");
      appendStreamingToken(" content");
      finalizeStreaming();

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.role).toBe("assistant");
      expect(state.messages[0]?.content).toBe("Streaming content");
      expect(state.streamingContent).toBe("");
      expect(state.isStreaming).toBe(false);
    });

    it("should not finalize if streamingContent is empty", () => {
      const { finalizeStreaming } = store.getState();

      finalizeStreaming();

      const state = store.getState();
      expect(state.messages).toHaveLength(0);
    });
  });

  describe("clearChat", () => {
    it("should clear all messages and streaming state", () => {
      const { addMessage, appendStreamingToken, clearChat } = store.getState();

      addMessage({ role: "user", content: "Test" });
      appendStreamingToken("Streaming");
      clearChat();

      const state = store.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.streamingContent).toBe("");
      expect(state.isStreaming).toBe(false);
    });
  });
});
