/**
 * Settings slice - user preferences and config
 */

import type { StateCreator } from 'zustand';
import type { Mode } from '../../../core/types';

export interface SettingsSlice {
  readonly mode: Mode;
  readonly model: string;
  readonly provider: string;
  readonly sessionId: string;

  // Actions
  readonly setMode: (mode: Mode) => void;
  readonly setModel: (model: string) => void;
  readonly setProvider: (provider: string) => void;
  readonly setSessionId: (sessionId: string) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  mode: 'ask',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  sessionId: '',

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
});
