/**
 * SettingsPanel - Provider configuration UI
 * Allows users to configure API keys, models, and advanced settings
 */

import React, { useState, useEffect } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import type { TestConnectionPayload, SaveSettingsPayload } from '../../../shared/protocol';

type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'openrouter' | 'litellm';

interface SettingsState {
  readonly provider: ProviderType;
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly hasApiKey: boolean;
}

const PROVIDER_MODELS: Record<ProviderType, readonly string[]> = {
  anthropic: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-opus-3-5-20240229',
    'claude-sonnet-3-5-20240620',
  ],
  openai: [
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1-preview',
    'o1-mini',
  ],
  ollama: [
    'llama3.2',
    'llama3.1',
    'codellama',
    'mistral',
    'mixtral',
  ],
  openrouter: [
    'anthropic/claude-opus-4-7',
    'anthropic/claude-sonnet-4-6',
    'openai/gpt-4-turbo',
    'meta-llama/llama-3.1-405b',
  ],
  litellm: [
    'anthropic/claude-opus-4-7',
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-haiku-4-5',
    'openai/gpt-4-turbo',
    'gemini/gemini-pro',
  ],
};

export default function SettingsPanel() {
  const { sendMessage } = useVSCode();

  const [settings, setSettings] = useState<SettingsState>({
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-4-6',
    baseUrl: '',
    maxTokens: 4096,
    temperature: 0.7,
    hasApiKey: false,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load settings on mount
  useEffect(() => {
    sendMessage({ type: 'load_settings', payload: {} });

    // Listen for settings_loaded message
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'settings_loaded') {
        setSettings({
          provider: message.payload.provider,
          apiKey: '',
          model: message.payload.model,
          baseUrl: message.payload.baseUrl ?? '',
          maxTokens: message.payload.maxTokens,
          temperature: message.payload.temperature,
          hasApiKey: message.payload.hasApiKey,
        });
      } else if (message.type === 'connection_test_result') {
        setTestResult({
          success: message.payload.success,
          message: message.payload.message,
        });
        setIsTesting(false);
      } else if (message.type === 'settings_saved') {
        setSaveResult({
          success: message.payload.success,
          message: message.payload.message,
        });
        setIsSaving(false);
        if (message.payload.success) {
          // Reload settings after save
          setTimeout(() => {
            sendMessage({ type: 'load_settings', payload: {} });
          }, 500);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleProviderChange = (provider: ProviderType) => {
    setSettings({
      ...settings,
      provider,
      model: PROVIDER_MODELS[provider][0] ?? '',
      baseUrl: '',
    });
    setTestResult(null);
    setSaveResult(null);
  };

  const handleTestConnection = () => {
    if (!settings.apiKey) {
      setTestResult({ success: false, message: 'API Key is required' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const payload: TestConnectionPayload = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl || undefined,
    };

    sendMessage({ type: 'test_connection', payload });
  };

  const handleSaveSettings = () => {
    if (!settings.apiKey && !settings.hasApiKey) {
      setSaveResult({ success: false, message: 'API Key is required' });
      return;
    }

    setIsSaving(true);
    setSaveResult(null);

    const payload: SaveSettingsPayload = {
      provider: settings.provider,
      apiKey: settings.apiKey || undefined,
      model: settings.model,
      baseUrl: settings.baseUrl || undefined,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
    };

    sendMessage({ type: 'save_settings', payload });
  };

  return (
    <div className="h-full w-full overflow-y-auto px-6 py-4 bg-[var(--vscode-editor-background)]">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b border-[var(--vscode-panel-border)] pb-4">
          <h2 className="text-lg font-medium">Provider Settings</h2>
          <p className="text-sm opacity-60 mt-1">
            Configure your AI provider, API keys, and model preferences
          </p>
        </div>

        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Provider</label>
          <select
            value={settings.provider}
            onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
            className="w-full px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--vscode-button-background)]"
          >
            <option value="anthropic">Anthropic</option>
            <option value="litellm">LiteLLM</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            API Key
            {settings.hasApiKey && (
              <span className="ml-2 text-xs text-green-500">✓ Saved</span>
            )}
          </label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            placeholder={settings.hasApiKey ? '••••••••••••••••' : 'Enter your API key'}
            className="w-full px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--vscode-button-background)]"
          />
          <p className="text-xs opacity-50">
            Your API key is stored securely in VSCode secrets
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Model</label>
          <select
            value={settings.model}
            onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--vscode-button-background)]"
          >
            {PROVIDER_MODELS[settings.provider].map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* Base URL (Optional for some providers) */}
        {(settings.provider === 'litellm' || settings.provider === 'ollama' || settings.provider === 'openrouter') && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Base URL {settings.provider === 'litellm' && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder={
                settings.provider === 'litellm'
                  ? 'https://litellm.int.thomsonreuters.com'
                  : settings.provider === 'ollama'
                    ? 'http://localhost:11434'
                    : 'https://openrouter.ai/api/v1'
              }
              className="w-full px-3 py-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[var(--vscode-button-background)]"
            />
          </div>
        )}

        {/* Advanced Settings */}
        <div className="border-t border-[var(--vscode-panel-border)] pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium hover:opacity-80"
          >
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
              ▶
            </span>
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 pl-6">
              {/* Max Tokens */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Max Tokens: {settings.maxTokens}
                </label>
                <input
                  type="range"
                  min="1024"
                  max="8192"
                  step="512"
                  value={settings.maxTokens}
                  onChange={(e) =>
                    setSettings({ ...settings, maxTokens: parseInt(e.target.value, 10) })
                  }
                  className="w-full"
                />
                <p className="text-xs opacity-50">
                  Maximum tokens to generate per response
                </p>
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Temperature: {settings.temperature.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) =>
                    setSettings({ ...settings, temperature: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
                <p className="text-xs opacity-50">
                  Controls randomness: 0 = deterministic, 1 = creative
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Test Connection Result */}
        {testResult && (
          <div
            className={`px-4 py-3 rounded border ${
              testResult.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Save Result */}
        {saveResult && (
          <div
            className={`px-4 py-3 rounded border ${
              saveResult.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <p className="text-sm">{saveResult.message}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !settings.apiKey}
            className="px-4 py-2 bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="px-4 py-2 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
