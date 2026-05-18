/**
 * Hook to process runtime events from extension
 */

import { useEffect } from "react";
import { useStore } from "../store";
import type { ExtensionToWebviewMessage } from "../../shared/protocol";
import type { ToolExecution } from "../store/slices/chatSlice";

export function useRuntimeEvents() {
  // Track current activity context
  let currentActivityContextId: string | null = null;

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      // Usar getState() para evitar dependências no useEffect e múltiplos listeners
      const store = useStore.getState();
      const message = event.data;

      if (message.type === "init") {
        const { mode, model, isExecuting } = message.payload;
        store.setMode(mode);
        store.setModel(model);
        store.setExecuting(isExecuting);
        return;
      }

      if (message.type === "runtime_event") {
        const runtimeEvent = message.payload.event;

        switch (runtimeEvent.type) {
          case "iteration_start": {
            const event = runtimeEvent;
            store.setIteration(event.iteration);
            store.setExecuting(true);
            store.addTimelineEvent({
              type: "iteration",
              description: `Iteration ${event.iteration} started`,
              status: "pending",
            });

            // NOVO: Criar contexto de atividade para iteração
            currentActivityContextId = store.startContext(
              `Iteration ${event.iteration}`,
            );
            store.addActivityItem(currentActivityContextId, {
              category: "execution",
              context: `Iteration ${event.iteration}`,
              description: "Iteration started",
              status: "pending",
            });
            break;
          }

          case "iteration_complete": {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: "iteration",
              description: `Iteration ${event.iteration} completed`,
              status: "success",
              metadata: { hadToolCalls: event.hadToolCalls },
            });

            // NOVO: Finalizar contexto de atividade
            if (currentActivityContextId) {
              store.addActivityItem(currentActivityContextId, {
                category: "execution",
                context: `Iteration ${event.iteration}`,
                description: "Iteration completed",
                status: "success",
                duration: event.duration,
              });
              store.endContext(currentActivityContextId);
              currentActivityContextId = null;
            }
            break;
          }

          case "token": {
            const event = runtimeEvent;
            // Garantir que há conversa ativa antes de processar streaming
            let chatId = useStore.getState().activeChatId;
            if (!chatId) {
              chatId = useStore.getState().createChat("Nova conversa");
            }

            // Se estava thinking, finalizar antes de iniciar streaming
            const activeChat = useStore.getState().conversations[chatId];
            if (activeChat?.isThinking) {
              store.finalizeThinking(chatId);
            }

            store.appendStreamingToken(chatId, event.content);
            break;
          }

          case "thinking": {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;

            // Append thinking content
            if (chatId && event.content) {
              store.appendThinkingToken(chatId, event.content);
            }

            store.addTimelineEvent({
              type: "thinking",
              description: "Reasoning...",
              status: "pending",
            });

            // NOVO: Adicionar thinking ao activity log
            if (currentActivityContextId) {
              store.addActivityItem(currentActivityContextId, {
                category: "thinking",
                context: "Thinking",
                description: "Model is reasoning",
                status: "pending",
              });
            }
            break;
          }

          case "tool_call": {
            const event = runtimeEvent;

            // Add to timeline (existing behavior)
            store.addTimelineEvent({
              type: "tool",
              description: `Tool: ${event.name}`,
              status: "pending",
              metadata: { toolName: event.name, input: event.input },
            });
            store.updateMetrics({
              toolCallCount:
                (useStore.getState().metrics.toolCallCount ?? 0) + 1,
            });

            // NEW: Add pending tool to active message tracking
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              const toolPending: ToolExecution = {
                id: event.id,
                name: event.name,
                description: `${event.name}`,
                status: "pending",
                duration: 0,
                timestamp: event.timestamp,
              };

              // Use store-based tracking instead of local variable
              store.addActiveMessageTool(chatId, toolPending);
            }

            // NOVO: Adicionar tool call ao activity log
            if (currentActivityContextId) {
              store.addActivityItem(currentActivityContextId, {
                category: "tool",
                context: `Tool: ${event.name}`,
                description: `Executing ${event.name}`,
                status: "pending",
                metadata: { toolName: event.name, input: event.input },
              });
            }
            break;
          }

          case "tool_result": {
            const event = runtimeEvent;

            // Add to timeline (existing behavior)
            store.addTimelineEvent({
              type: "tool",
              description: `Tool ${event.name} completed`,
              status: event.success ? "success" : "error",
              metadata: { toolName: event.name },
            });

            // NEW: Update tool status and duration in active message tracking
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              // Use store-based tracking instead of local variable
              store.updateActiveMessageTool(chatId, event.id, {
                status: event.success ? "success" : "error",
                duration: event.duration,
              });
            }

            // NOVO: Adicionar tool result ao activity log
            if (currentActivityContextId) {
              store.addActivityItem(currentActivityContextId, {
                category: "tool",
                context: `Tool: ${event.name}`,
                description: event.success
                  ? `${event.name} completed successfully`
                  : `${event.name} failed`,
                status: event.success ? "success" : "error",
                duration: event.duration,
              });
            }
            break;
          }

          case "done": {
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              // Transfer activeMessageTools to message metadata
              const activeChat = useStore.getState().conversations[chatId];
              if (activeChat?.activeMessageTools) {
                const totalDuration = activeChat.activeMessageTools.reduce(
                  (sum, t) => sum + t.duration,
                  0,
                );

                store.updateActiveMessageMetadata(chatId, {
                  execution: {
                    tools: activeChat.activeMessageTools,
                    isExpanded: false,
                    totalDuration,
                  },
                });
              }

              store.finalizeStreaming(chatId);
              // Clear active message tools for next message
              store.clearActiveMessageTools(chatId);
            }
            store.setExecuting(false);
            break;
          }

          case "execution_complete": {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;

            // NOVO: Atualizar métricas de tokens
            store.updateMetrics({
              inputTokens: event.metrics.inputTokens ?? 0,
              outputTokens: event.metrics.outputTokens ?? 0,
              cachedTokens: event.metrics.cachedTokens ?? 0,
              tokenCount:
                (event.metrics.inputTokens ?? 0) +
                (event.metrics.outputTokens ?? 0),
            });

            // Add status card if successful
            if (event.success && chatId) {
              const totalTokens =
                (event.metrics.inputTokens ?? 0) +
                (event.metrics.outputTokens ?? 0);
              const duration = event.metrics.totalDuration
                ? (event.metrics.totalDuration / 1000).toFixed(1)
                : "0";

              store.addMessage(chatId, {
                role: "assistant",
                content: "",
                metadata: {
                  statusCard: {
                    type: "completed",
                    title: "Concluído com sucesso",
                    subtitle: [
                      `${event.iterations} iterações`,
                      `${event.metrics.totalToolCalls} ferramentas`,
                      `${totalTokens} tokens`,
                      `${duration}s`,
                    ].join(" • "),
                  },
                },
              });
            }
            break;
          }

          case "error": {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              store.finalizeStreaming(chatId);
            }
            store.setExecuting(false);
            store.addTimelineEvent({
              type: "error",
              description: event.error,
              status: "error",
              metadata: { error: event.error },
            });
            break;
          }

          case "checkpoint_created": {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: "checkpoint",
              description: "Checkpoint created",
              status: "success",
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }

          case "checkpoint_restored": {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: "checkpoint",
              description: "Checkpoint restored",
              status: "success",
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }
        }
      }

      if (message.type === "terminal_session_created") {
        const { sessionId, shellPath } = message.payload;
        store.createSession(sessionId, shellPath);
      }

      if (message.type === "terminal_output") {
        const { sessionId, data } = message.payload;
        store.appendOutput(sessionId, data);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []); // Array vazio - listener registrado apenas uma vez
}
