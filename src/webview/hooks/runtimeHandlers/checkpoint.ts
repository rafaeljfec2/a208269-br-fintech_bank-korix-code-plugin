import type { RuntimeEvent, RuntimeEventContext } from "../runtimeEventDispatcher";
import { addActiveEventItem } from "../runtimeEventDispatcher";

export function handleCheckpointEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): boolean {
  const { store } = ctx;

  switch (event.type) {
    case "checkpoint_created": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: "Checkpoint created",
        status: "success",
        metadata: { checkpointId: event.checkpointId },
      });
      addActiveEventItem(
        {
          stage: "checkpoint_created",
          title: "Checkpoint created",
          summary: `${event.filesChanged ?? 0} changed file(s) captured.`,
          status: "success",
          timestamp: event.timestamp,
          metadata: { checkpointId: event.checkpointId },
        },
        ctx,
      );
      return true;
    }

    case "checkpoint_restored": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: "Checkpoint restored",
        status: "success",
        metadata: { checkpointId: event.checkpointId },
      });
      addActiveEventItem(
        {
          stage: "checkpoint_restored",
          title: "Checkpoint restored",
          summary: "Runtime state restored from checkpoint.",
          status: "success",
          timestamp: event.timestamp,
          metadata: { checkpointId: event.checkpointId },
        },
        ctx,
      );
      return true;
    }

    case "recovery_started": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: `Recovery started: ${event.action} (attempt ${event.attempt})`,
        status: "pending",
        metadata: { action: event.action, attempt: event.attempt },
      });
      addActiveEventItem(
        {
          stage: "recovery_started",
          title: `Recovery started: ${event.action}`,
          summary: `Attempt ${event.attempt}.`,
          status: "pending",
          timestamp: event.timestamp,
          metadata: { action: event.action, attempt: event.attempt },
        },
        ctx,
      );
      return true;
    }

    case "recovery_complete": {
      store.addTimelineEvent({
        type: "checkpoint",
        description: `Recovery ${event.success ? "succeeded" : "failed"}: ${event.action}`,
        status: event.success ? "success" : "error",
        metadata: { action: event.action, success: event.success },
      });
      addActiveEventItem(
        {
          stage: "recovery_complete",
          title: `Recovery ${event.success ? "completed" : "failed"}`,
          summary: event.action,
          status: event.success ? "success" : "error",
          timestamp: event.timestamp,
          metadata: { action: event.action },
        },
        ctx,
      );
      return true;
    }

    default:
      return false;
  }
}
