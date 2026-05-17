/**
 * Hook to process runtime events from extension
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import type { ExtensionToWebviewMessage } from '../../shared/protocol';

export function useRuntimeEvents() {
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
            store.addTimelineEvent({
              type: 'tool',
              description: `Tool: ${event.name}`,
              status: 'pending',
              metadata: { toolName: event.name, input: event.input },
            });
            store.updateMetrics({ toolCallCount: (useStore.getState().metrics.toolCallCount ?? 0) + 1 });
            break;
          }

          case 'tool_result': {
            const event = runtimeEvent;
            store.addTimelineEvent({
              type: 'tool',
              description: `Tool ${event.name} completed`,
              status: 'success',
              metadata: { toolName: event.name },
            });
            break;
          }

          case 'done': {
            const chatId = useStore.getState().activeChatId;
            if (chatId) {
              store.finalizeStreaming(chatId);
            }
            store.setExecuting(false);
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
