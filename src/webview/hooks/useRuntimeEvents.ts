/**
 * Hook to process runtime events from extension
 */

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import type { ExtensionToWebviewMessage } from "../../shared/protocol";
import { logger } from "../utils/logger";
import { useVSCode } from "./useVSCode";
import { dispatchRuntimeEvent } from "./runtimeEventDispatcher";
import type { RuntimeEventContext } from "./runtimeEventDispatcher";

export function useRuntimeEvents() {
  const { sendMessage } = useVSCode();
  // Track current activity context - usar ref para persistir entre renders
  const currentActivityContextIdRef = useRef<string | null>(null);
  const eventListCounterRef = useRef(0);
  const lastCompletedChatIdRef = useRef<string | null>(null);
  const responseStreamingNotedRef = useRef(false);

  // Token batching - acumula tokens e faz flush periódico para reduzir re-renders
  const tokenBufferRef = useRef<{ chatId: string; tokens: string[] } | null>(
    null,
  );
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushTokens = () => {
      if (tokenBufferRef.current && tokenBufferRef.current.tokens.length > 0) {
        const { chatId, tokens } = tokenBufferRef.current;
        const combinedTokens = tokens.join("");
        useStore.getState().appendStreamingToken(chatId, combinedTokens);
        tokenBufferRef.current = null;
      }
      flushTimerRef.current = null;
    };

    const bufferToken = (chatId: string, token: string) => {
      // Inicializar buffer se necessário
      if (!tokenBufferRef.current || tokenBufferRef.current.chatId !== chatId) {
        // Flush buffer anterior se houver
        if (tokenBufferRef.current) {
          flushTokens();
        }
        tokenBufferRef.current = { chatId, tokens: [] };
      }

      // Adicionar token ao buffer
      tokenBufferRef.current.tokens.push(token);

      // Agendar flush se não houver timer ativo (throttle de 50ms)
      if (!flushTimerRef.current) {
        flushTimerRef.current = window.setTimeout(
          flushTokens,
          50,
        ) as unknown as number;
      }
    };

    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const store = useStore.getState();
      const message = event.data;

      try {
        if (message.type === "init") {
          const { mode, provider, model, availableModels, isExecuting } =
            message.payload;
          store.setMode(mode);
          store.setProvider(provider);
          store.setModel(model);
          store.setAvailableModels(availableModels ?? []);
          store.setProviderReady(true);
          store.setExecuting(isExecuting);
          return;
        }

        if (message.type === "mode_changed") {
          store.setMode(message.payload.mode);
          return;
        }

        if (message.type === "runtime_event") {
          const runtimeEvent = message.payload.event;

          const context: RuntimeEventContext = {
            store,
            currentActivityContextId: currentActivityContextIdRef.current,
            setCurrentActivityContextId: (id) => {
              currentActivityContextIdRef.current = id;
            },
            lastCompletedChatId: lastCompletedChatIdRef.current,
            setLastCompletedChatId: (id) => {
              lastCompletedChatIdRef.current = id;
            },
            responseStreamingNoted: responseStreamingNotedRef.current,
            setResponseStreamingNoted: (noted) => {
              responseStreamingNotedRef.current = noted;
            },
            eventListCounter: eventListCounterRef.current,
            incrementEventListCounter: () => {
              eventListCounterRef.current += 1;
              return eventListCounterRef.current;
            },
            bufferToken,
            flushTokens,
          };

          dispatchRuntimeEvent(runtimeEvent, context);
        }

        if (message.type === "terminal_session_created") {
          const { sessionId, shellPath } = message.payload;
          store.createSession(sessionId, shellPath);
        }

        if (message.type === "terminal_output") {
          const { sessionId, data } = message.payload;
          store.appendOutput(sessionId, data);
        }
      } catch (error) {
        // Top-level error - log and continue listening
        logger.error("[RuntimeEvents] Critical error in message handler:", {
          messageType: message.type,
          error,
          message,
        });

        // Still try to add to timeline
        try {
          store.addTimelineEvent({
            type: "error",
            description: `Message handler error: ${error instanceof Error ? error.message : String(error)}`,
            status: "error",
          });
        } catch {
          logger.error(
            "[RuntimeEvents] Failed to add critical error to timeline",
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);

    sendMessage({ type: "webview_ready", payload: {} });

    return () => {
      // Cleanup: remover listener
      window.removeEventListener("message", handleMessage);

      // Cleanup: flush pending tokens e limpar timer
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTokens(); // Flush final antes de desmontar
      }
    };
  }, []); // Array vazio - listener registrado apenas uma vez
}
