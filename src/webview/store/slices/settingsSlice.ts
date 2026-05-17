/**
 * Settings slice - user preferences and config
 */

import type { StateCreator } from 'zustand';
import type { Mode } from '../../../core/types';

export type ActiveTab = 'chat' | 'timeline' | 'terminal' | 'settings';

export interface SettingsSlice {
  readonly mode: Mode;
  readonly model: string;
  readonly provider: string;
  readonly sessionId: string;
  readonly activeTab: ActiveTab;

  // Actions
  readonly setMode: (mode: Mode) => void;
  readonly setModel: (model: string) => void;
  readonly setProvider: (provider: string) => void;
  readonly setSessionId: (sessionId: string) => void;
  readonly setActiveTab: (tab: ActiveTab) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  mode: 'ask',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  sessionId: '',
  activeTab: 'chat',

  setMode: (mode) =>
    set(() => ({
      mode,
    })),

  setModel: (model) =>
    set(() => ({
      model,
    })),

  setProvider: (provider) =>
    set(() => ({
      provider,
    })),

  setSessionId: (sessionId) =>
    set(() => ({
      sessionId,
    })),

  setActiveTab: (tab) => {
    console.log('[SettingsSlice] setActiveTab called with:', tab);
    set(() => ({
      activeTab: tab,
    }));
    console.log('[SettingsSlice] activeTab updated to:', tab);
  },
});
