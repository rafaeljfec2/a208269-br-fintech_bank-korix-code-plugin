import type { ToolExecution } from "../../store/slices/chatSlice";
import { formatToolActivity } from "../../utils/toolActivityFormatter";
import type { RuntimeEvent, RuntimeEventContext } from "../runtimeEventDispatcher";
import { addActiveEventItem, getBatchEvidenceDisplay } from "../runtimeEventDispatcher";

export function handleToolsEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): boolean {
  const { store } = ctx;

  switch (event.type) {
    case "tool_call": {
      const activity = formatToolActivity(event.name, event.input);
      const toolMetadata = {
        toolCallId: event.id,
        toolName: event.name,
        input: event.input,
        displayAction: activity.action,
        targetLabel: activity.targetLabel,
        displayLabel: activity.label,
      };

      store.addTimelineEvent({
        type: "tool",
        description: activity.label,
        status: "pending",
        metadata: toolMetadata,
      });
      addActiveEventItem(
        {
          stage: "tool_call",
          title: activity.label,
          summary: "Tool execution requested by the agent loop.",
          status: "pending",
          timestamp: event.timestamp,
          metadata: toolMetadata,
        },
        ctx,
      );
      store.updateMetrics({
        toolCallCount: (store.metrics.toolCallCount ?? 0) + 1,
      });

      const chatId = store.activeChatId;
      if (chatId) {
        const toolPending: ToolExecution = {
          id: event.id,
          name: event.name,
          description: activity.label,
          status: "pending",
          duration: 0,
          timestamp: event.timestamp,
        };

        store.addActiveMessageTool(chatId, toolPending);
      }

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "tool",
          context: activity.label,
          description: `Executing ${activity.label}`,
          status: "pending",
          metadata: toolMetadata,
        });
      }
      return true;
    }

    case "tool_result": {
      const batchEvidence =
        event.name === "CollectWorkspaceEvidence"
          ? getBatchEvidenceDisplay(event.result)
          : undefined;
      const metadata = {
        toolCallId: event.id,
        toolName: event.name,
        ...(batchEvidence?.metadata ?? {}),
      };

      store.addTimelineEvent({
        type: "tool",
        description: `Tool ${event.name} completed`,
        status: event.success ? "success" : "error",
        metadata: {
          toolName: event.name,
          ...(batchEvidence?.metadata ?? {}),
        },
      });
      addActiveEventItem(
        {
          stage: "tool_result",
          title: `${event.name} ${event.success ? "completed" : "failed"}`,
          summary:
            batchEvidence?.summary ??
            `Tool finished in ${event.duration ?? 0}ms.`,
          status: event.success ? "success" : "error",
          timestamp: event.timestamp,
          durationMs: event.duration,
          metadata,
        },
        ctx,
      );

      const chatId = store.activeChatId;
      if (chatId) {
        store.updateActiveMessageTool(chatId, event.id, {
          status: event.success ? "success" : "error",
          duration: event.duration,
        });
      }

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "tool",
          context: `Tool: ${event.name}`,
          description: event.success
            ? `${event.name} completed successfully`
            : `${event.name} failed`,
          status: event.success ? "success" : "error",
          duration: event.duration,
        });
      }
      return true;
    }

    case "tool_approval_required": {
      store.addTimelineEvent({
        type: "tool",
        description: `Approval required: ${event.name}`,
        status: "pending",
        metadata: { toolName: event.name },
      });
      addActiveEventItem(
        {
          stage: "tool_approval_required",
          title: `Approval required: ${event.name}`,
          summary: "Waiting for user approval before tool execution.",
          status: "pending",
          timestamp: event.timestamp,
          metadata: { toolName: event.name },
        },
        ctx,
      );
      return true;
    }

    case "tool_approved": {
      const approvalSummary =
        event.duration !== undefined
          ? `User approved tool execution after ${event.duration}ms.`
          : "User approved tool execution.";

      store.addTimelineEvent({
        type: "tool",
        description: `Tool approved: ${event.name}`,
        status: "success",
        metadata: { toolName: event.name, duration: event.duration },
      });
      addActiveEventItem(
        {
          stage: "tool_approved",
          title: `Tool approved: ${event.name}`,
          summary: approvalSummary,
          status: "success",
          timestamp: event.timestamp,
          durationMs: event.duration,
          metadata: { toolName: event.name },
        },
        ctx,
      );
      return true;
    }

    case "tool_denied": {
      const denialSummary =
        event.duration !== undefined
          ? `${event.reason} after ${event.duration}ms.`
          : event.reason;

      store.addTimelineEvent({
        type: "tool",
        description: `Tool denied: ${event.name} - ${event.reason}`,
        status: "error",
        metadata: {
          toolName: event.name,
          reason: event.reason,
          duration: event.duration,
        },
      });
      addActiveEventItem(
        {
          stage: "tool_denied",
          title: `Tool denied: ${event.name}`,
          summary: denialSummary,
          status: "error",
          timestamp: event.timestamp,
          durationMs: event.duration,
          metadata: { toolName: event.name },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "tool",
          context: `Tool: ${event.name}`,
          description: `Denied: ${event.reason}`,
          status: "error",
        });
      }
      return true;
    }

    case "patch_applied": {
      store.addTimelineEvent({
        type: "tool",
        description: `Patch applied: ${event.file}:${event.lineNumber} (${event.operation})`,
        status: "success",
        metadata: {
          file: event.file,
          lineNumber: event.lineNumber,
          operation: event.operation,
        },
      });
      addActiveEventItem(
        {
          stage: "patch_applied",
          title: "Patch applied",
          summary: `${event.operation} at ${event.file}:${event.lineNumber}.`,
          status: "success",
          timestamp: event.timestamp,
          metadata: { file: event.file, operation: event.operation },
        },
        ctx,
      );
      return true;
    }

    case "patch_failed": {
      store.addTimelineEvent({
        type: "error",
        description: `Patch failed: ${event.file} - ${event.error}`,
        status: "error",
        metadata: { file: event.file, error: event.error },
      });
      addActiveEventItem(
        {
          stage: "patch_failed",
          title: "Patch failed",
          summary: `${event.file}: ${event.error}`,
          status: "error",
          timestamp: event.timestamp,
          metadata: { file: event.file },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "error",
          context: "Patch",
          description: `Failed to patch ${event.file}: ${event.error}`,
          status: "error",
        });
      }
      return true;
    }

    default:
      return false;
  }
}
