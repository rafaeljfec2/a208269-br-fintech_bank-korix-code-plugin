import type { RuntimeEvent, RuntimeEventContext } from "../runtimeEventDispatcher";
import { addActiveEventItem } from "../runtimeEventDispatcher";

export function handleProviderEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): boolean {
  const { store } = ctx;

  switch (event.type) {
    case "token": {
      let chatId = store.activeChatId;
      if (!chatId) {
        chatId = store.createChat("Nova conversa");
      }

      const activeChat = store.conversations[chatId];
      if (activeChat?.isThinking) {
        store.finalizeThinking(chatId);
      }

      if (!ctx.responseStreamingNoted) {
        addActiveEventItem(
          {
            stage: "token_stream",
            title: "Streaming final response",
            summary: "Validated assistant text is being sent to chat.",
            status: "pending",
            timestamp: event.timestamp,
          },
          ctx,
        );
        ctx.setResponseStreamingNoted(true);
      }

      ctx.bufferToken(chatId, event.content);
      return true;
    }

    case "thinking": {
      store.addTimelineEvent({
        type: "thinking",
        description: "Reasoning...",
        status: "pending",
      });
      addActiveEventItem(
        {
          stage: "provider_thinking",
          title: "Provider reasoning signal",
          summary:
            "Internal provider thinking received; raw reasoning hidden.",
          status: "pending",
          timestamp: event.timestamp,
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "thinking",
          context: "Thinking",
          description: "Provider reasoning signal received",
          status: "pending",
        });
      }
      return true;
    }

    case "provider_request_start": {
      const toolChoice = event.toolChoice ? `, choice ${event.toolChoice}` : "";
      const modelContext = `${store.provider}/${store.model}`;

      store.addTimelineEvent({
        type: "thinking",
        description: "Waiting model",
        status: "pending",
        metadata: {
          iteration: event.iteration,
          correlationId: event.correlationId,
          toolCount: event.toolCount,
          toolChoice: event.toolChoice,
        },
      });
      addActiveEventItem(
        {
          stage: "provider_request_start",
          title: "Waiting model",
          summary: `${modelContext} with ${event.toolCount} tool(s).`,
          status: "pending",
          timestamp: event.timestamp,
          metadata: {
            iteration: event.iteration,
            correlationId: event.correlationId,
            toolCount: event.toolCount,
            toolChoice: event.toolChoice,
          },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Provider",
          description: `Waiting model (${event.toolCount} tool(s)${toolChoice})`,
          status: "pending",
          metadata: {
            correlationId: event.correlationId,
            toolCount: event.toolCount,
            toolChoice: event.toolChoice,
          },
        });
      }
      return true;
    }

    case "provider_first_output": {
      addActiveEventItem(
        {
          stage: "provider_first_output",
          title: "Model first output",
          summary: `First ${event.outputKind} after ${event.latency}ms.`,
          status: "success",
          timestamp: event.timestamp,
          durationMs: event.latency,
          metadata: {
            iteration: event.iteration,
            correlationId: event.correlationId,
            outputKind: event.outputKind,
          },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Provider",
          description: `First ${event.outputKind}`,
          status: "success",
          duration: event.latency,
          metadata: {
            correlationId: event.correlationId,
            outputKind: event.outputKind,
          },
        });
      }
      return true;
    }

    case "provider_request_end": {
      store.addTimelineEvent({
        type: "thinking",
        description: `Model response completed in ${event.duration}ms`,
        status: "success",
        metadata: {
          iteration: event.iteration,
          correlationId: event.correlationId,
          stopReason: event.stopReason,
          tokenCount: event.tokenCount,
          hadToolCalls: event.hadToolCalls,
        },
      });
      addActiveEventItem(
        {
          stage: "provider_request_end",
          title: "Model response completed",
          summary: `Provider finished in ${event.duration}ms with ${event.tokenCount} token(s).`,
          status: "success",
          timestamp: event.timestamp,
          durationMs: event.duration,
          metadata: {
            iteration: event.iteration,
            correlationId: event.correlationId,
            stopReason: event.stopReason,
            hadToolCalls: event.hadToolCalls,
          },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "Provider",
          description: "Model response completed",
          status: "success",
          duration: event.duration,
          metadata: {
            correlationId: event.correlationId,
            stopReason: event.stopReason,
            tokenCount: event.tokenCount,
            hadToolCalls: event.hadToolCalls,
          },
        });
      }
      return true;
    }

    case "response_buffer_start": {
      store.addTimelineEvent({
        type: "thinking",
        description: "Buffering response for validation",
        status: "pending",
        metadata: { reason: event.reason },
      });
      addActiveEventItem(
        {
          stage: "response_buffer_start",
          title: "Buffering response",
          summary:
            "Response is being held for workspace evidence validation.",
          status: "pending",
          timestamp: event.timestamp,
          metadata: { reason: event.reason },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "thinking",
          context: "Response validation",
          description: "Buffering response",
          status: "pending",
          metadata: { reason: event.reason },
        });
      }
      return true;
    }

    case "response_buffer_flush": {
      const title =
        event.reason === "blocked"
          ? "Buffered response blocked"
          : "Buffered response released";
      const summary =
        event.reason === "blocked"
          ? `Response buffer blocked after ${event.duration}ms.`
          : `Response buffer ${event.reason} after ${event.duration}ms.`;

      store.addTimelineEvent({
        type: "thinking",
        description: title,
        status: event.reason === "blocked" ? "error" : "success",
        metadata: {
          reason: event.reason,
          responseLength: event.responseLength,
          duration: event.duration,
        },
      });
      addActiveEventItem(
        {
          stage: "response_buffer_flush",
          title,
          summary,
          status: event.reason === "blocked" ? "error" : "success",
          timestamp: event.timestamp,
          durationMs: event.duration,
          metadata: {
            reason: event.reason,
            responseLength: event.responseLength,
          },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "thinking",
          context: "Response validation",
          description: title,
          status: event.reason === "blocked" ? "error" : "success",
          duration: event.duration,
          metadata: {
            reason: event.reason,
            responseLength: event.responseLength,
          },
        });
      }
      return true;
    }

    case "thinking_step": {
      const chatId =
        store.activeChatId ?? store.createChat("Nova conversa");

      store.addActiveThinkingItem(chatId, {
        id: event.item.id,
        stage: event.item.stage,
        title: event.item.title,
        summary: event.item.summary,
        status: event.item.status,
        timestamp: event.item.timestamp,
        durationMs: event.item.durationMs,
        metadata: event.item.metadata,
      });

      store.addTimelineEvent({
        type: "thinking",
        description: event.item.title,
        status:
          event.item.status === "error"
            ? "error"
            : event.item.status === "pending"
              ? "pending"
              : "success",
        metadata: {
          stage: event.item.stage,
          summary: event.item.summary,
        },
      });

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "thinking",
          context: event.item.title,
          description: event.item.summary,
          status:
            event.item.status === "error"
              ? "error"
              : event.item.status === "pending"
                ? "pending"
                : "success",
        });
      }
      return true;
    }

    case "context_evidence": {
      store.addTimelineEvent({
        type: "thinking",
        description: event.evidence.summary,
        status: event.evidence.items.length > 0 ? "success" : "error",
        metadata: {
          itemCount: event.evidence.items.length,
          totalTokens: event.evidence.totalTokens,
        },
      });
      addActiveEventItem(
        {
          stage: "context_evidence",
          title: "Workspace evidence checked",
          summary: event.evidence.summary,
          status: event.evidence.items.length > 0 ? "success" : "warning",
          timestamp: event.timestamp,
          metadata: {
            itemCount: event.evidence.items.length,
            totalTokens: event.evidence.totalTokens,
          },
        },
        ctx,
      );
      return true;
    }

    case "observation_summary": {
      store.addTimelineEvent({
        type: "thinking",
        description: event.summary.summary,
        status: event.summary.success ? "success" : "error",
        metadata: {
          sourceName: event.summary.sourceName,
          truncated: event.summary.truncated,
        },
      });
      addActiveEventItem(
        {
          stage: "observation_summary",
          title: `Observed ${event.summary.sourceName}`,
          summary: event.summary.summary,
          status: event.summary.success ? "success" : "error",
          timestamp: event.timestamp,
          metadata: {
            sourceName: event.summary.sourceName,
            truncated: event.summary.truncated,
          },
        },
        ctx,
      );
      return true;
    }

    case "reflection_summary": {
      const chatId =
        store.activeChatId ?? store.createChat("Nova conversa");
      store.addActiveThinkingItem(chatId, {
        id: event.item.id,
        stage: event.item.stage,
        title: event.item.title,
        summary: event.item.summary,
        status: event.item.status,
        timestamp: event.item.timestamp,
        durationMs: event.item.durationMs,
        metadata: event.item.metadata,
      });
      return true;
    }

    case "response_validation": {
      store.addTimelineEvent({
        type: "thinking",
        description: event.validation.summary,
        status: event.validation.status === "passed" ? "success" : "error",
        metadata: {
          riskFlags: event.validation.riskFlags,
          evidenceCount: event.validation.evidenceCount,
        },
      });
      addActiveEventItem(
        {
          stage: "response_validation",
          title: "Answer validated",
          summary: event.validation.summary,
          status:
            event.validation.status === "passed"
              ? "success"
              : event.validation.status === "warning"
                ? "warning"
                : "error",
          timestamp: event.timestamp,
          metadata: {
            riskFlags: event.validation.riskFlags,
            evidenceCount: event.validation.evidenceCount,
          },
        },
        ctx,
      );
      return true;
    }

    default:
      return false;
  }
}
