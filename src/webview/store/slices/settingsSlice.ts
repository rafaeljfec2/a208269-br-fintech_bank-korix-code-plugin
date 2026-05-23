/**
 * Settings slice - user preferences and config
 */

import type { StateCreator } from "zustand";
import type { Mode } from "../../../core/types";

export type ActiveTab =
  | "chat"
  | "timeline"
  | "terminal"
  | "settings"
  | "activity";

export interface SettingsSlice {
  readonly mode: Mode;
  readonly model: string;
  readonly availableModels: readonly string[];
  readonly provider: string;
  readonly isProviderReady: boolean;
  readonly sessionId: string;
  readonly activeTab: ActiveTab;

  // Actions
  readonly setMode: (mode: Mode) => void;
  readonly setModel: (model: string) => void;
  readonly setAvailableModels: (models: readonly string[]) => void;
  readonly setProvider: (provider: string) => void;
  readonly setProviderReady: (isProviderReady: boolean) => void;
  readonly setSessionId: (sessionId: string) => void;
  readonly setActiveTab: (tab: ActiveTab) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  mode: "ask",
  model: "claude-sonnet-4-6",
  availableModels: [],
  provider: "anthropic",
  isProviderReady: false,
  sessionId: "",
  activeTab: "chat",

  setMode: (mode) =>
    set(() => ({
      mode,
    })),

  setModel: (model) =>
    set(() => ({
      model,
    })),

  setAvailableModels: (availableModels) =>
    set(() => ({
      availableModels,
    })),

  setProvider: (provider) =>
    set(() => ({
      provider,
    })),

  setProviderReady: (isProviderReady) =>
    set(() => ({
      isProviderReady,
    })),

  setSessionId: (sessionId) =>
    set(() => ({
      sessionId,
    })),

  setActiveTab: (tab) => {
    console.log("[SettingsSlice] setActiveTab called with:", tab);
    set(() => ({
      activeTab: tab,
    }));
    console.log("[SettingsSlice] activeTab updated to:", tab);
  },
});
