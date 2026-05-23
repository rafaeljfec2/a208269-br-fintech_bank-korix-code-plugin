import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { ProviderType } from "./types";

const vscodeState = vi.hoisted(() => ({
  getConfigurationCalls: 0,
  secretGetCalls: 0,
  secretStoreCalls: 0,
  listener: undefined as
    | ((event: { affectsConfiguration: (section: string) => boolean }) => void)
    | undefined,
  secrets: new Map<string, string>(),
}));

const fetchMock = vi.fn<typeof fetch>();

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => {
      vscodeState.getConfigurationCalls += 1;

      return {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          const values = new Map<string, unknown>([
            ["provider", "litellm"],
            ["litellm.model", "test-model"],
            ["litellm.baseUrl", "https://litellm.test"],
            ["maxTokens", 1024],
            ["temperature", 0.2],
          ]);

          return values.get(key) ?? defaultValue;
        }),
      };
    }),
    onDidChangeConfiguration: vi.fn(
      (
        listener: (event: {
          affectsConfiguration: (section: string) => boolean;
        }) => void,
      ) => {
        vscodeState.listener = listener;
        return { dispose: vi.fn() };
      },
    ),
  },
  window: {
    showInputBox: vi.fn(),
  },
}));

import { ProviderConfigManager } from "./config";

describe("ProviderConfigManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vscodeState.getConfigurationCalls = 0;
    vscodeState.secretGetCalls = 0;
    vscodeState.secretStoreCalls = 0;
    vscodeState.listener = undefined;
    vscodeState.secrets = new Map<string, string>([
      ["korix.apiKey.litellm", "secret-key"],
    ]);
  });

  const createContext = (): vscode.ExtensionContext =>
    ({
      subscriptions: [],
      secrets: {
        get: async (key: string) => {
          vscodeState.secretGetCalls += 1;
          return vscodeState.secrets.get(key);
        },
        store: async (key: string, value: string) => {
          vscodeState.secretStoreCalls += 1;
          vscodeState.secrets.set(key, value);
        },
        delete: async (key: string) => {
          vscodeState.secrets.delete(key);
        },
        onDidChange: vi.fn(),
      },
    }) as unknown as vscode.ExtensionContext;

  it("should cache active provider config and invalidate on API key changes", async () => {
    const manager = new ProviderConfigManager(createContext());
    const providerType: ProviderType = "litellm";

    const first = await manager.getConfig(providerType);
    const second = await manager.getConfig(providerType);

    expect(first).toEqual(second);
    expect(vscodeState.secretGetCalls).toBe(1);

    await manager.setApiKey(providerType, "new-key");
    const third = await manager.getConfig(providerType);

    expect(third?.apiKey).toBe("new-key");
    expect(vscodeState.secretStoreCalls).toBe(1);
    expect(vscodeState.secretGetCalls).toBe(2);
  });

  it("should expose configured model without requiring an API key", () => {
    vscodeState.secrets.clear();
    const manager = new ProviderConfigManager(createContext());

    expect(manager.getConfiguredModel("litellm")).toBe("test-model");
  });

  it("should invalidate cache when korix configuration changes", async () => {
    const manager = new ProviderConfigManager(createContext());

    await manager.getConfig("litellm");
    await manager.getConfig("litellm");
    vscodeState.listener?.({
      affectsConfiguration: (section: string) => section === "korix",
    });
    await manager.getConfig("litellm");

    expect(vscodeState.secretGetCalls).toBe(2);
  });

  it("should list LiteLLM models from the configured endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-5.5" },
            { model_name: "anthropic/claude-opus-4-7" },
            { model: "openai/gpt-5.5" },
            { id: "anthropic/*" },
            { id: "all-proxy-models" },
            { id: "openai/gpt-image-1.5" },
            { id: "openai/text-embedding-3-small" },
            { id: "openai/gpt-realtime" },
            { id: "openai/gpt-5-search-api" },
            { id: "vertex_ai/gemini-2.5-pro" },
            "gemini/gemini-2.5-pro",
          ],
        }),
        { status: 200 },
      ),
    );

    const manager = new ProviderConfigManager(createContext());
    const models = await manager.listLiteLLMModels();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://litellm.test/models?return_wildcard_routes=false",
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-litellm-api-key": "secret-key",
        },
      },
    );
    expect(models).toEqual([
      "anthropic/claude-opus-4-7",
      "gemini/gemini-2.5-pro",
      "openai/gpt-5.5",
      "vertex_ai/gemini-2.5-pro",
    ]);
  });

  it("should not request LiteLLM models without an API key", async () => {
    vscodeState.secrets.clear();

    const manager = new ProviderConfigManager(createContext());

    await expect(manager.listLiteLLMModels()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should return an empty model list when LiteLLM discovery fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const manager = new ProviderConfigManager(createContext());

    await expect(manager.listLiteLLMModels()).resolves.toEqual([]);
  });
});
