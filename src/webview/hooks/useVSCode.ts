/**
 * Hook to access VSCode API in webview
 */

import { useCallback } from "react";
import type { WebviewToExtensionMessage } from "../../shared/protocol";

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

let vscodeApi: ReturnType<typeof acquireVsCodeApi> | undefined;

function getVSCodeAPI() {
  if (vscodeApi) return vscodeApi;
  if (typeof acquireVsCodeApi === "undefined") {
    return {
      postMessage: () => {},
      getState: () => undefined,
      setState: () => {},
    };
  }
  vscodeApi = acquireVsCodeApi();
  return vscodeApi;
}

export function useVSCode() {
  const sendMessage = useCallback((message: WebviewToExtensionMessage) => {
    const api = getVSCodeAPI();
    api.postMessage(message);
  }, []);

  return { sendMessage };
}
