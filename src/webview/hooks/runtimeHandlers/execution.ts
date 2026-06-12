import { logger } from "../../utils/logger";
import type { RuntimeEvent, RuntimeEventContext } from "../runtimeEventDispatcher";
import { addActiveEventItem, appendCompletedEventItem } from "../runtimeEventDispatcher";

export function handleExecutionEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): boolean {
  const { store } = ctx;

  switch (event.type) {
    case "iteration_start": {
      ctx.setLastCompletedChatId(null);
      ctx.setResponseStreamingNoted(false);
      store.setIteration(event.iteration);
      store.setExecuting(true);
      store.addTimelineEvent({
        type: "iteration",
        description: `Iteration ${event.iteration} started`,
        status: "pending",
      });
      addActiveEventItem(
        {
          stage: "iteration_start",
          title: `Iteration ${event.iteration} started`,
          summary: "Agent loop started an execution step.",
          status: "pending",
          timestamp: event.timestamp,
        },
        ctx,
      );

      const newContextId = store.startContext(`Iteration ${event.iteration}`);
      ctx.setCurrentActivityContextId(newContextId);
      store.addActivityItem(newContextId, {
        category: "execution",
        context: `Iteration ${event.iteration}`,
        description: "Iteration started",
        status: "pending",
      });
      return true;
    }

    case "iteration_complete": {
      store.addTimelineEvent({
        type: "iteration",
        description: `Iteration ${event.iteration} completed`,
        status: "success",
        metadata: { hadToolCalls: event.hadToolCalls },
      });
      addActiveEventItem(
        {
          stage: "iteration_complete",
          title: `Iteration ${event.iteration} completed`,
          summary: event.hadToolCalls
            ? "Completed after tool activity."
            : "Completed without tool calls.",
          status: "success",
          timestamp: event.timestamp,
          durationMs: event.duration,
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: `Iteration ${event.iteration}`,
          description: "Iteration completed",
          status: "success",
          duration: event.duration,
        });
        store.endContext(ctx.currentActivityContextId);
        ctx.setCurrentActivityContextId(null);
      }
      return true;
    }

    case "done": {
      logger.log("[RuntimeEvents] Done event received", {
        timestamp: Date.now(),
        activeChatId: store.activeChatId,
        isExecuting: store.isExecuting,
      });

      ctx.flushTokens();

      let chatId = store.activeChatId;
      if (!chatId) {
        logger.warn(
          "[RuntimeEvents] No activeChatId, creating emergency chat",
        );
        chatId = store.createChat("Nova conversa");

        store.addMessage(chatId, {
          role: "system",
          content:
            "⚠️ Chat criado automaticamente para recuperar estado inconsistente.",
        });
      }

      const activeChat = store.conversations[chatId];
      addActiveEventItem(
        {
          stage: "done",
          title: "Provider turn completed",
          summary: "Final response stream is ready to commit.",
          status: "success",
          timestamp: event.timestamp,
          metadata: { stopReason: event.stopReason },
        },
        ctx,
      );
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
      ctx.setLastCompletedChatId(chatId);
      store.clearActiveMessageTools(chatId);
      store.clearActiveThinkingItems(chatId);
      ctx.setResponseStreamingNoted(false);

      logger.log("[RuntimeEvents] Setting isExecuting=false");
      store.setExecuting(false);

      const finalState = store;
      const finalChat = chatId ? finalState.conversations[chatId] : null;
      logger.log("[RuntimeEvents] Final state after done:", {
        isExecuting: finalState.isExecuting,
        isStreaming: finalChat?.isStreaming,
        hasStreamingContent: !!finalChat?.streamingContent,
      });
      return true;
    }

    case "execution_complete": {
      logger.log("[RuntimeEvents] execution_complete event:", {
        success: event.success,
        iterations: event.iterations,
        totalToolCalls: event.metrics.totalToolCalls,
        totalTokens: event.metrics.totalTokens,
        duration: event.metrics.duration,
      });
      appendCompletedEventItem(
        ctx.lastCompletedChatId ?? store.activeChatId,
        {
          stage: "execution_complete",
          title: event.success ? "Execution completed" : "Execution failed",
          summary: `${event.iterations} iteration(s), ${event.metrics.totalToolCalls} tool call(s), ${event.metrics.totalTokens} token(s).`,
          status: event.success ? "success" : "error",
          timestamp: event.timestamp,
          durationMs: event.metrics.duration,
          metadata: {
            iterations: event.iterations,
            totalToolCalls: event.metrics.totalToolCalls,
            totalTokens: event.metrics.totalTokens,
          },
        },
        ctx,
      );
      if (event.metrics.latency) {
        appendCompletedEventItem(
          ctx.lastCompletedChatId ?? store.activeChatId,
          {
            stage: "latency_summary",
            title: "Latency summary",
            summary:
              [
                `Model ${event.metrics.latency.providerDurationMs}ms`,
                `first output ${event.metrics.latency.providerFirstOutputLatencyMs}ms`,
                `tools ${event.metrics.latency.toolDurationMs}ms`,
                `approvals ${event.metrics.latency.approvalWaitMs}ms`,
                `buffering ${event.metrics.latency.responseBufferDurationMs}ms`,
                `overhead ${event.metrics.latency.iterationOverheadMs}ms`,
              ].join(", ") + ".",
            status: "success",
            timestamp: event.timestamp,
            durationMs: event.metrics.duration,
            metadata: event.metrics.latency,
          },
          ctx,
        );
      }

      store.updateMetrics({
        tokenCount: event.metrics.totalTokens ?? 0,
        toolCallCount: event.metrics.totalToolCalls ?? 0,
        iterationCount: event.iterations ?? 0,
      });

      if (event.success) {
        const duration = event.metrics.duration
          ? event.metrics.duration / 1000
          : 0;
        const completedChatId = ctx.lastCompletedChatId ?? store.activeChatId;
        const toolCount = event.metrics.totalToolCalls ?? 0;
        const tokenCount = event.metrics.totalTokens ?? 0;
        const iterationLabel =
          event.iterations === 1 ? "iteração" : "iterações";
        const toolLabel = toolCount === 1 ? "ferramenta" : "ferramentas";
        const summary = `Concluído: ${event.iterations} ${iterationLabel}, ${toolCount} ${toolLabel}, ${tokenCount} tokens em ${duration.toFixed(1)}s. Provider: ${store.provider}. Model: ${store.model}.`;

        if (completedChatId) {
          store.replaceLastAssistantFallbackContent(completedChatId, summary);
        }
      }
      return true;
    }

    case "error": {
      const chatId = store.activeChatId;
      if (chatId) {
        store.finalizeStreaming(chatId);
      }
      store.setExecuting(false);
      ctx.setResponseStreamingNoted(false);
      store.addTimelineEvent({
        type: "error",
        description: event.error,
        status: "error",
        metadata: { error: event.error },
      });
      addActiveEventItem(
        {
          stage: "runtime_error",
          title: "Runtime error",
          summary: event.error,
          status: "error",
          timestamp: event.timestamp,
          metadata: { recoverable: event.recoverable },
        },
        ctx,
      );
      return true;
    }

    case "cancelled": {
      const chatId = store.activeChatId;

      if (chatId) {
        store.finalizeStreaming(chatId);
      }
      store.setExecuting(false);
      ctx.setResponseStreamingNoted(false);

      store.addTimelineEvent({
        type: "error",
        description: `Cancelled: ${event.reason}`,
        status: "error",
        metadata: {
          reason: event.reason,
          iteration: event.iteration,
        },
      });
      addActiveEventItem(
        {
          stage: "cancelled",
          title: "Execution cancelled",
          summary: event.reason,
          status: "error",
          timestamp: event.timestamp,
          metadata: { iteration: event.iteration },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Control",
          description: `Execution cancelled: ${event.reason}`,
          status: "error",
        });
      }
      return true;
    }

    case "paused": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: "Execution paused",
        status: "pending",
      });
      addActiveEventItem(
        {
          stage: "paused",
          title: "Execution paused",
          summary: `Paused at iteration ${event.iteration}.`,
          status: "pending",
          timestamp: event.timestamp,
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Control",
          description: "Execution paused",
          status: "pending",
        });
      }
      return true;
    }

    case "resumed": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: "Execution resumed",
        status: "success",
      });
      addActiveEventItem(
        {
          stage: "resumed",
          title: "Execution resumed",
          summary: `Resumed at iteration ${event.iteration}.`,
          status: "success",
          timestamp: event.timestamp,
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Control",
          description: "Execution resumed",
          status: "success",
        });
      }
      return true;
    }

    case "stall_detected": {
      const stallSeconds = Math.round(event.timeSinceActivity / 1000);

      store.addTimelineEvent({
        type: "error",
        description: `Stall detected: ${stallSeconds}s without activity`,
        status: "error",
        metadata: {
          timeSinceActivity: event.timeSinceActivity,
          iteration: event.iteration,
        },
      });
      addActiveEventItem(
        {
          stage: "stall_detected",
          title: "Stall detected",
          summary: `${stallSeconds}s without runtime activity.`,
          status: "error",
          timestamp: event.timestamp,
          metadata: {
            timeSinceActivity: event.timeSinceActivity,
            iteration: event.iteration,
          },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "error",
          context: "Loop Guard",
          description: `No activity for ${stallSeconds}s`,
          status: "error",
        });
      }
      return true;
    }

    case "loop_warning": {
      store.addTimelineEvent({
        type: "error",
        description: `Loop warning: ${event.reason}`,
        status: "error",
        metadata: {
          reason: event.reason,
          iteration: event.iteration,
        },
      });
      addActiveEventItem(
        {
          stage: "loop_warning",
          title: "Loop warning",
          summary: event.reason,
          status: "warning",
          timestamp: event.timestamp,
          metadata: { iteration: event.iteration },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "error",
          context: "Loop Guard",
          description: event.reason,
          status: "error",
        });
      }
      return true;
    }

    default:
      return false;
  }
}
