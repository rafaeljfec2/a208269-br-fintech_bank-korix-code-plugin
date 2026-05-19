/**
 * Hook to process runtime events from extension
 */

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import type { ExtensionToWebviewMessage } from "../../shared/protocol";
import type { ToolExecution } from "../store/slices/chatSlice";
import { logger } from "../utils/logger";

export function useRuntimeEvents() {
  // Track current activity context - usar ref para persistir entre renders
  const currentActivityContextIdRef = useRef<string | null>(null);

  // Token batching - acumula tokens e faz flush periódico para reduzir re-renders
  const tokenBufferRef = useRef<{ chatId: string; tokens: string[] } | null>(
    null,
  );
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushTokens = () => {
      if (
        tokenBufferRef.current &&
        tokenBufferRef.current.tokens.length > 0
      ) {
        const { chatId, tokens } = tokenBufferRef.current;
        const combinedTokens = tokens.join("");
        useStore.getState().appendStreamingToken(chatId, combinedTokens);
        tokenBufferRef.current = null;
      }
      flushTimerRef.current = null;
    };

    const bufferToken = (chatId: string, token: string) => {
      // Inicializar buffer se necessário
      if (
        !tokenBufferRef.current ||
        tokenBufferRef.current.chatId !== chatId
      ) {
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
        flushTimerRef.current = window.setTimeout(flushTokens, 50) as unknown as number;
      }
    };
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      // Usar getState() para evitar dependências no useEffect e múltiplos listeners
      const store = useStore.getState();
      const message = event.data;

      try {
        if (message.type === "init") {
          const { mode, model, isExecuting } = message.payload;
          store.setMode(mode);
          store.setModel(model);
          store.setExecuting(isExecuting);
          return;
        }

        if (message.type === "runtime_event") {
          const runtimeEvent = message.payload.event;

          try {
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
            currentActivityContextIdRef.current = store.startContext(
              `Iteration ${event.iteration}`,
            );
            store.addActivityItem(currentActivityContextIdRef.current, {
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
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: `Iteration ${event.iteration}`,
                description: "Iteration completed",
                status: "success",
                duration: event.duration,
              });
              store.endContext(currentActivityContextIdRef.current);
              currentActivityContextIdRef.current = null;
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

            // Usar batching para reduzir re-renders (flush a cada 50ms)
            bufferToken(chatId, event.content);
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
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
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
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
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
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
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
            logger.log("[RuntimeEvents] Done event received", {
              timestamp: Date.now(),
              activeChatId: useStore.getState().activeChatId,
              isExecuting: useStore.getState().isExecuting,
            });

            // FIX: Flush pending tokens immediately and cancel timer
            // This prevents race condition where timer fires AFTER finalizeStreaming
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = null;
            }
            flushTokens(); // Flush any remaining buffered tokens NOW

            // FIX: Garantir que há chat ativo ANTES de processar
            let chatId = useStore.getState().activeChatId;
            if (!chatId) {
              logger.warn("[RuntimeEvents] No activeChatId, creating emergency chat");
              chatId = useStore.getState().createChat("Nova conversa");

              // Adicionar mensagem de sistema explicativa
              store.addMessage(chatId, {
                role: "system",
                content: "⚠️ Chat criado automaticamente para recuperar estado inconsistente.",
              });
            }

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

            logger.log("[RuntimeEvents] Calling finalizeStreaming for chat:", chatId);
            store.finalizeStreaming(chatId);
            // Clear active message tools for next message
            store.clearActiveMessageTools(chatId);

            logger.log("[RuntimeEvents] Setting isExecuting=false");
            store.setExecuting(false);

            // Verificação de estado final
            const finalState = useStore.getState();
            const finalChat = chatId ? finalState.conversations[chatId] : null;
            logger.log("[RuntimeEvents] Final state after done:", {
              isExecuting: finalState.isExecuting,
              isStreaming: finalChat?.isStreaming,
              hasStreamingContent: !!finalChat?.streamingContent,
            });

            break;
          }

          case "execution_complete": {
            const event = runtimeEvent;

            logger.log("[RuntimeEvents] execution_complete event:", {
              success: event.success,
              iterations: event.iterations,
              totalToolCalls: event.metrics.totalToolCalls,
              totalTokens: event.metrics.totalTokens,
              duration: event.metrics.duration,
            });

            // NOVO: Atualizar métricas de tokens
            store.updateMetrics({
              tokenCount: event.metrics.totalTokens ?? 0,
              toolCallCount: event.metrics.totalToolCalls ?? 0,
              iterationCount: event.iterations ?? 0,
            });

            // Set completion stats for ExecutionFeedback
            if (event.success) {
              const duration = event.metrics.duration
                ? event.metrics.duration / 1000
                : 0;

              const stats = {
                iterations: event.iterations,
                toolCalls: event.metrics.totalToolCalls ?? 0,
                tokens: event.metrics.totalTokens ?? 0,
                duration,
                timestamp: Date.now(),
              };

              logger.log("[RuntimeEvents] Setting completion stats:", stats);
              store.setCompletionStats(stats);

              // Auto-clear after 5 seconds
              setTimeout(() => {
                logger.log("[RuntimeEvents] Auto-clearing completion stats");
                store.setCompletionStats(null);
              }, 5000);
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

          case "user_question": {
            const event = runtimeEvent;

            console.log("[useRuntimeEvents] user_question received!", {
              questionId: event.questionId,
              title: event.title,
              question: event.question,
              optionsCount: event.options.length,
              mode: event.mode,
            });
            logger.log("[useRuntimeEvents] user_question received:", event);

            // Add visual indicator in chat that a question was asked
            const chatId = useStore.getState().activeChatId ?? useStore.getState().createChat("Nova conversa");
            store.addMessage(chatId, {
              role: "system",
              content: `💬 **${event.title}**: ${event.question}`,
              metadata: {
                statusCard: {
                  type: "plan_created",
                  title: "Aguardando sua resposta",
                  subtitle: `${event.options.length} opções disponíveis no formulário abaixo`,
                },
              },
            });

            // Set active question in footer
            store.setActiveQuestion({
              questionId: event.questionId,
              title: event.title,
              question: event.question,
              mode: event.mode,
              options: event.options,
              timeoutMs: event.timeoutMs,
              defaultAnswer: event.defaultAnswer,
            });

            // Activity log
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: "User Question",
                description: `Asked: ${event.title}`,
                status: "pending",
              });
            }
            break;
          }

          case "user_answer": {
            const event = runtimeEvent;
            const source = event.isTimeout ? " (timeout)" : "";

            // Clear active question from UI
            store.clearActiveQuestion();

            // Activity log
            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: "User Answer",
                description: `Answered${source}: ${event.answers.join(", ")}`,
                status: "success",
              });
            }
            break;
          }

          // Guard events
          case "stall_detected": {
            const event = runtimeEvent;
            const stallSeconds = Math.round(event.timeSinceActivity / 1000);

            store.addTimelineEvent({
              type: "error",
              description: `Stall detected: ${stallSeconds}s without activity`,
              status: "error",
              metadata: { timeSinceActivity: event.timeSinceActivity, iteration: event.iteration },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "error",
                context: "Loop Guard",
                description: `No activity for ${stallSeconds}s`,
                status: "error",
              });
            }
            break;
          }

          case "duplicate_tool_detected": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "error",
              description: `Duplicate tool: ${event.toolName} (${event.count}x)`,
              status: "error",
              metadata: { toolName: event.toolName, count: event.count },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "error",
                context: "Loop Guard",
                description: `Tool ${event.toolName} called ${event.count} times`,
                status: "error",
              });
            }
            break;
          }

          case "loop_warning": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "error",
              description: `Loop warning: ${event.reason}`,
              status: "error",
              metadata: { reason: event.reason, iteration: event.iteration },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "error",
                context: "Loop Guard",
                description: event.reason,
                status: "error",
              });
            }
            break;
          }

          // Recovery events
          case "recovery_started": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "checkpoint",
              description: `Recovery started: ${event.action} (attempt ${event.attempt})`,
              status: "pending",
              metadata: { action: event.action, attempt: event.attempt },
            });
            break;
          }

          case "recovery_complete": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "checkpoint",
              description: `Recovery ${event.success ? "succeeded" : "failed"}: ${event.action}`,
              status: event.success ? "success" : "error",
              metadata: { action: event.action, success: event.success },
            });
            break;
          }

          // Control events
          case "cancelled": {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;

            if (chatId) {
              store.finalizeStreaming(chatId);
            }
            store.setExecuting(false);

            store.addTimelineEvent({
              type: "error",
              description: `Cancelled: ${event.reason}`,
              status: "error",
              metadata: { reason: event.reason, iteration: event.iteration },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: "Control",
                description: `Execution cancelled: ${event.reason}`,
                status: "error",
              });
            }
            break;
          }

          case "paused": {
            store.addTimelineEvent({
              type: "checkpoint",
              description: "Execution paused",
              status: "pending",
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: "Control",
                description: "Execution paused",
                status: "pending",
              });
            }
            break;
          }

          case "resumed": {
            store.addTimelineEvent({
              type: "checkpoint",
              description: "Execution resumed",
              status: "success",
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "execution",
                context: "Control",
                description: "Execution resumed",
                status: "success",
              });
            }
            break;
          }

          // Tool approval events
          case "tool_approval_required": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "tool",
              description: `Approval required: ${event.name}`,
              status: "pending",
              metadata: { toolName: event.name },
            });
            break;
          }

          case "tool_approved": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "tool",
              description: `Tool approved: ${event.name}`,
              status: "success",
              metadata: { toolName: event.name },
            });
            break;
          }

          case "tool_denied": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "tool",
              description: `Tool denied: ${event.name} - ${event.reason}`,
              status: "error",
              metadata: { toolName: event.name, reason: event.reason },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "tool",
                context: `Tool: ${event.name}`,
                description: `Denied: ${event.reason}`,
                status: "error",
              });
            }
            break;
          }

          // Patch events
          case "patch_applied": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "tool",
              description: `Patch applied: ${event.file}:${event.lineNumber} (${event.operation})`,
              status: "success",
              metadata: { file: event.file, lineNumber: event.lineNumber, operation: event.operation },
            });
            break;
          }

          case "patch_failed": {
            const event = runtimeEvent;

            store.addTimelineEvent({
              type: "error",
              description: `Patch failed: ${event.file} - ${event.error}`,
              status: "error",
              metadata: { file: event.file, error: event.error },
            });

            if (currentActivityContextIdRef.current) {
              store.addActivityItem(currentActivityContextIdRef.current, {
                category: "error",
                context: "Patch",
                description: `Failed to patch ${event.file}: ${event.error}`,
                status: "error",
              });
            }
            break;
          }

          default: {
            // Unhandled event type - log warning but don't crash
            logger.warn("[RuntimeEvents] Unhandled event type:", runtimeEvent);
            break;
          }
        }
          } catch (eventError) {
            // Event-specific error - log but don't crash the listener
            logger.error("[RuntimeEvents] Error processing runtime event:", {
              eventType: runtimeEvent.type,
              error: eventError,
              event: runtimeEvent,
            });

            // Add error to timeline for visibility
            try {
              store.addTimelineEvent({
                type: "error",
                description: `Event processing error: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
                status: "error",
                metadata: { eventType: runtimeEvent.type },
              });
            } catch {
              // If timeline update fails, just log
              logger.error("[RuntimeEvents] Failed to add event error to timeline");
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
          // If even timeline fails, just log
          logger.error("[RuntimeEvents] Failed to add critical error to timeline");
        }
      }
    };

    window.addEventListener("message", handleMessage);

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
