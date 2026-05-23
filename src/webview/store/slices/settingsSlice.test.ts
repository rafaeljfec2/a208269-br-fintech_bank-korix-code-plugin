/**
 * Settings slice tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { createSettingsSlice, type SettingsSlice } from "./settingsSlice";

describe("settingsSlice", () => {
  let store: ReturnType<typeof create<SettingsSlice>>;

  beforeEach(() => {
    store = create<SettingsSlice>(createSettingsSlice);
  });

  describe("initial state", () => {
    it("should initialize with default values", () => {
      const state = store.getState();

      expect(state.mode).toBe("ask");
      expect(state.model).toBe("claude-sonnet-4-6");
      expect(state.availableModels).toEqual([]);
      expect(state.provider).toBe("anthropic");
      expect(state.isProviderReady).toBe(false);
      expect(state.sessionId).toBe("");
    });
  });

  describe("setMode", () => {
    it("should update mode to ask", () => {
      const { setMode } = store.getState();

      setMode("ask");

      const state = store.getState();
      expect(state.mode).toBe("ask");
    });

    it("should update mode to plan", () => {
      const { setMode } = store.getState();

      setMode("plan");

      const state = store.getState();
      expect(state.mode).toBe("plan");
    });

    it("should update mode to agent", () => {
      const { setMode } = store.getState();

      setMode("agent");

      const state = store.getState();
      expect(state.mode).toBe("agent");
    });
  });

  describe("setModel", () => {
    it("should update model", () => {
      const { setModel } = store.getState();

      setModel("claude-opus-4-7");

      const state = store.getState();
      expect(state.model).toBe("claude-opus-4-7");
    });

    it("should accept haiku model", () => {
      const { setModel } = store.getState();

      setModel("claude-haiku-4-5");

      const state = store.getState();
      expect(state.model).toBe("claude-haiku-4-5");
    });
  });

  describe("setAvailableModels", () => {
    it("should update available models", () => {
      const { setAvailableModels } = store.getState();

      setAvailableModels(["anthropic/claude-opus-4-7"]);

      expect(store.getState().availableModels).toEqual([
        "anthropic/claude-opus-4-7",
      ]);
    });
  });

  describe("setProvider", () => {
    it("should update provider", () => {
      const { setProvider } = store.getState();

      setProvider("openai");

      const state = store.getState();
      expect(state.provider).toBe("openai");
    });

    it("should allow custom providers", () => {
      const { setProvider } = store.getState();

      setProvider("custom-llm");

      const state = store.getState();
      expect(state.provider).toBe("custom-llm");
    });
  });

  describe("setProviderReady", () => {
    it("should mark provider config as ready", () => {
      const { setProviderReady } = store.getState();

      setProviderReady(true);

      expect(store.getState().isProviderReady).toBe(true);
    });
  });

  describe("setSessionId", () => {
    it("should update session id", () => {
      const { setSessionId } = store.getState();

      setSessionId("session-abc-123");

      const state = store.getState();
      expect(state.sessionId).toBe("session-abc-123");
    });

    it("should allow empty session id", () => {
      const { setSessionId } = store.getState();

      setSessionId("session-1");
      setSessionId("");

      const state = store.getState();
      expect(state.sessionId).toBe("");
    });
  });

  describe("combined updates", () => {
    it("should handle multiple setting changes", () => {
      const { setMode, setModel, setProvider, setSessionId } = store.getState();

      setMode("agent");
      setModel("claude-opus-4-7");
      setProvider("openai");
      setSessionId("session-xyz");

      const state = store.getState();
      expect(state.mode).toBe("agent");
      expect(state.model).toBe("claude-opus-4-7");
      expect(state.provider).toBe("openai");
      expect(state.sessionId).toBe("session-xyz");
    });
  });
});
