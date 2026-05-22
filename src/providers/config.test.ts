import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { ProviderType } from "./types";

const vscodeState = vi.hoisted(() => ({
  getConfigurationCalls: 0,
  secretGetCalls: 0,
  secretStoreCalls: 0,
  listener: undefined as
    | ((event: { affectsConfiguration: (section: string) => boolean }) => void)
    | undefined,
  secrets: new Map<string, string>([["korix.apiKey.litellm", "secret-key"]]),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => {
      vscodeState.getConfigurationCalls += 1;

      return {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          const values = new Map<string, unknown>([
            ["provider", "litellm"],
            ["litellm.model", "test-model"],
            ["litellm.apiBase", "https://litellm.test"],
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

  it("should invalidate cache when korix configuration changes", async () => {
    const manager = new ProviderConfigManager(createContext());

    await manager.getConfig("litellm");
    await manager.getConfig("litellm");
    vscodeState.listener?.({
      affectsConfiguration: (section: string) => section === "korix",
    });
    await manager.getConfig("litellm");

    expect(vscodeState.secretGetCalls).toBeGreaterThanOrEqual(3);
  });
});
