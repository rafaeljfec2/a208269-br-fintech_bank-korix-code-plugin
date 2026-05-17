/**
 * Type-safe message protocol between Extension and Webview
 * Extension (Node.js) ↔ Webview (Browser)
 */

import type { RuntimeEvent } from '../core/runtime/runtimeEvents';

// ============================================================
// Extension → Webview Messages
// ============================================================

export interface InitPayload {
  readonly sessionId: string;
  readonly mode: 'ask' | 'plan' | 'agent';
  readonly model: string;
  readonly isExecuting: boolean;
  readonly workspaceRoot?: string;
}

export interface RuntimeEventPayload {
  readonly event: RuntimeEvent;
}

export interface TerminalOutputPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface TerminalSessionCreatedPayload {
  readonly sessionId: string;
  readonly shellPath: string;
}

export interface ModeChangedPayload {
  readonly mode: 'ask' | 'plan' | 'agent';
}

export interface SettingsLoadedPayload {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly hasApiKey: boolean;
}

export interface ConnectionTestResultPayload {
  readonly success: boolean;
  readonly message: string;
}

export interface SettingsSavedPayload {
  readonly success: boolean;
  readonly message: string;
}

export type ExtensionToWebviewMessage =
  | { readonly type: 'init'; readonly payload: InitPayload }
  | { readonly type: 'runtime_event'; readonly payload: RuntimeEventPayload }
  | { readonly type: 'terminal_output'; readonly payload: TerminalOutputPayload }
  | { readonly type: 'terminal_session_created'; readonly payload: TerminalSessionCreatedPayload }
  | { readonly type: 'mode_changed'; readonly payload: ModeChangedPayload }
  | { readonly type: 'settings_loaded'; readonly payload: SettingsLoadedPayload }
  | { readonly type: 'connection_test_result'; readonly payload: ConnectionTestResultPayload }
  | { readonly type: 'settings_saved'; readonly payload: SettingsSavedPayload };

// ============================================================
// Webview → Extension Messages
// ============================================================

export interface SendMessagePayload {
  readonly content: string;
  readonly messages?: readonly { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export interface ChangeModePayload {
  readonly mode: 'ask' | 'plan' | 'agent';
}

export interface ApproveToolPayload {
  readonly toolCallId: string;
  readonly approval: 'once' | 'always' | 'reject';
}

export interface TerminalInputPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface CreateTerminalPayload {
  readonly shellPath?: string;
}

export interface RestoreCheckpointPayload {
  readonly checkpointId: string;
}

export interface SaveSettingsPayload {
  readonly provider: 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'litellm';
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface TestConnectionPayload {
  readonly provider: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export type WebviewToExtensionMessage =
  | { readonly type: 'send_message'; readonly payload: SendMessagePayload }
  | { readonly type: 'change_mode'; readonly payload: ChangeModePayload }
  | { readonly type: 'approve_tool'; readonly payload: ApproveToolPayload }
  | { readonly type: 'terminal_input'; readonly payload: TerminalInputPayload }
  | { readonly type: 'create_terminal'; readonly payload: CreateTerminalPayload }
  | { readonly type: 'restore_checkpoint'; readonly payload: RestoreCheckpointPayload }
  | { readonly type: 'save_settings'; readonly payload: SaveSettingsPayload }
  | { readonly type: 'test_connection'; readonly payload: TestConnectionPayload }
  | { readonly type: 'load_settings'; readonly payload: Record<string, never> };

// ============================================================
// Helper Type Guards
// ============================================================

export function isExtensionMessage(msg: unknown): msg is ExtensionToWebviewMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && 'payload' in msg;
}

export function isWebviewMessage(msg: unknown): msg is WebviewToExtensionMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg && 'payload' in msg;
}
