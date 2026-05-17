/**
 * Hook to process runtime events from extension
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import type { ExtensionToWebviewMessage } from '../../shared/protocol';
import type { ToolExecution } from '../store/slices/chatSlice';

export function useRuntimeEvents() {
  // Track current message tools (scoped to current message)
  let currentMessageTools: ToolExecution[] = [];

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      // Usar getState() para evitar dependências no useEffect e múltiplos listeners
      const store = useStore.getState();
      const message = event.data;

      if (message.type === 'init') {
        const { mode, model, isExecuting } = message.payload;
        store.setMode(mode);
        store.setModel(model);
        store.setExecuting(isExecuting);
        return;
      }

      if (message.type === 'runtime_event') {
        const runtimeEvent = message.payload.event;

        switch (runtimeEvent.type) {
          case 'iteration_start': {
            const event = runtimeEvent;
            store.setIteration(event.iteration);
            store.setExecuting(true);
            store.addTimelineEvent({
              type: 'iteration',
              description: `Iteration ${event.iteration} started`,
              status: 'pending',
            });
            break;
          }

          case 'iteration_complete': {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: 'iteration',
              description: `Iteration ${event.iteration} completed`,
              status: 'success',
              metadata: { hadToolCalls: event.hadToolCalls },
            });
            break;
          }

          case 'token': {
            const event = runtimeEvent;
            // Garantir que há conversa ativa antes de processar streaming
            let chatId = useStore.getState().activeChatId;
            if (!chatId) {
              chatId = useStore.getState().createChat('Nova conversa');
            }
            store.appendStreamingToken(chatId, event.content);
            break;
          }

          case 'thinking':
            store.addTimelineEvent({
              type: 'thinking',
              description: 'Reasoning...',
              status: 'pending',
            });
            break;

          case 'tool_call': {
            const event = runtimeEvent;

            // Add to timeline (existing behavior)
            store.addTimelineEvent({
              type: 'tool',
              description: `Tool: ${event.name}`,
              status: 'pending',
              metadata: { toolName: event.name, input: event.input },
            });
            store.updateMetrics({ toolCallCount: (useStore.getState().metrics.toolCallCount ?? 0) + 1 });

            // NEW: Add pending tool to current message metadata
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              const toolPending: ToolExecution = {
                id: event.id,
                name: event.name,
                description: `${event.name}`,
                status: 'pending',
                duration: 0,
                timestamp: event.timestamp,
              };
              currentMessageTools.push(toolPending);

              store.updateActiveMessageMetadata(chatId, {
                execution: {
                  tools: [...currentMessageTools],
                  isExpanded: false,
                  totalDuration: 0,
                },
              });
            }
            break;
          }

          case 'tool_result': {
            const event = runtimeEvent;

            // Add to timeline (existing behavior)
            store.addTimelineEvent({
              type: 'tool',
              description: `Tool ${event.name} completed`,
              status: event.success ? 'success' : 'error',
              metadata: { toolName: event.name },
            });

            // NEW: Update tool status and duration in message metadata
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              const toolIndex = currentMessageTools.findIndex(t => t.id === event.id);
              if (toolIndex !== -1) {
                currentMessageTools[toolIndex] = {
                  ...currentMessageTools[toolIndex],
                  status: event.success ? 'success' : 'error',
                  duration: event.duration,
                };

                const totalDuration = currentMessageTools.reduce((sum, t) => sum + t.duration, 0);

                store.updateActiveMessageMetadata(chatId, {
                  execution: {
                    tools: [...currentMessageTools],
                    isExpanded: true, // Auto-expand when tools complete
                    totalDuration,
                  },
                });
              }
            }
            break;
          }

          case 'done': {
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              store.finalizeStreaming(chatId);
            }
            store.setExecuting(false);

            // Reset tools tracking for next message
            currentMessageTools = [];
            break;
          }

          case 'execution_complete': {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;

            // Add status card if successful
            if (event.success && chatId) {
              store.addMessage(chatId, {
                role: 'assistant',
                content: '',
                metadata: {
                  statusCard: {
                    type: 'completed',
                    title: 'Concluído com sucesso',
                    subtitle: `${event.iterations} iterações, ${event.metrics.totalToolCalls} ferramentas`,
                  },
                },
              });
            }
            break;
          }

          case 'error': {
            const event = runtimeEvent;
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              store.finalizeStreaming(chatId);
            }
            store.setExecuting(false);
            store.addTimelineEvent({
              type: 'error',
              description: event.error,
              status: 'error',
              metadata: { error: event.error },
            });
            break;
          }

          case 'checkpoint_created': {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: 'checkpoint',
              description: 'Checkpoint created',
              status: 'success',
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }

          case 'checkpoint_restored': {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: 'checkpoint',
              description: 'Checkpoint restored',
              status: 'success',
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }
        }
      }

      if (message.type === 'terminal_session_created') {
        const { sessionId, shellPath } = message.payload;
        store.createSession(sessionId, shellPath);
      }

      if (message.type === 'terminal_output') {
        const { sessionId, data } = message.payload;
        store.appendOutput(sessionId, data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []); // Array vazio - listener registrado apenas uma vez
}
