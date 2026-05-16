/**
 * Hook to process runtime events from extension
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import type { ExtensionToWebviewMessage } from '../../shared/protocol';

export function useRuntimeEvents() {
  const addMessage = useStore((state) => state.addMessage);
  const appendStreamingToken = useStore((state) => state.appendStreamingToken);
  const finalizeStreaming = useStore((state) => state.finalizeStreaming);
  const addTimelineEvent = useStore((state) => state.addTimelineEvent);
  const setExecuting = useStore((state) => state.setExecuting);
  const setIteration = useStore((state) => state.setIteration);
  const updateMetrics = useStore((state) => state.updateMetrics);
  const setMode = useStore((state) => state.setMode);
  const setModel = useStore((state) => state.setModel);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;

      if (message.type === 'init') {
        const { mode, model, isExecuting } = message.payload;
        setMode(mode);
        setModel(model);
        setExecuting(isExecuting);
        return;
      }

      if (message.type === 'runtime_event') {
        const runtimeEvent = message.payload.event;

        switch (runtimeEvent.type) {
          case 'iteration_start': {
            const event = runtimeEvent;
            setIteration(event.iteration);
            setExecuting(true);
            addTimelineEvent({
              type: 'iteration',
              description: `Iteration ${event.iteration} started`,
              status: 'pending',
            });
            break;
          }

          case 'iteration_complete': {
            const event = runtimeEvent;
            addTimelineEvent({
              type: 'iteration',
              description: `Iteration ${event.iteration} completed`,
              status: 'success',
              metadata: { hadToolCalls: event.hadToolCalls },
            });
            break;
          }

          case 'token': {
            const event = runtimeEvent;
            appendStreamingToken(event.content);
            break;
          }

          case 'thinking':
            addTimelineEvent({
              type: 'thinking',
              description: 'Reasoning...',
              status: 'pending',
            });
            break;

          case 'tool_call': {
            const event = runtimeEvent;
            addTimelineEvent({
              type: 'tool',
              description: `Tool: ${event.name}`,
              status: 'pending',
              metadata: { toolName: event.name, input: event.input },
            });
            updateMetrics({ toolCallCount: (useStore.getState().metrics.toolCallCount ?? 0) + 1 });
            break;
          }

          case 'tool_result': {
            const event = runtimeEvent;
            addTimelineEvent({
              type: 'tool',
              description: `Tool ${event.name} completed`,
              status: 'success',
              metadata: { toolName: event.name },
            });
            break;
          }

          case 'done':
            finalizeStreaming();
            setExecuting(false);
            break;

          case 'error': {
            const event = runtimeEvent;
            finalizeStreaming();
            setExecuting(false);
            addTimelineEvent({
              type: 'error',
              description: event.error,
              status: 'error',
              metadata: { error: event.error },
            });
            break;
          }

          case 'checkpoint_created': {
            const event = runtimeEvent;
            addTimelineEvent({
              type: 'checkpoint',
              description: 'Checkpoint created',
              status: 'success',
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }

          case 'checkpoint_restored': {
            const event = runtimeEvent;
            addTimelineEvent({
              type: 'checkpoint',
              description: 'Checkpoint restored',
              status: 'success',
              metadata: { checkpointId: event.checkpointId },
            });
            break;
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    addMessage,
    appendStreamingToken,
    finalizeStreaming,
    addTimelineEvent,
    setExecuting,
    setIteration,
    updateMetrics,
    setMode,
    setModel,
  ]);
}
