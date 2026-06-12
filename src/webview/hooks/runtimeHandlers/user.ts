import { logger } from "../../utils/logger";
import type { RuntimeEvent, RuntimeEventContext } from "../runtimeEventDispatcher";
import { addActiveEventItem } from "../runtimeEventDispatcher";

export function handleUserEvent(
  event: RuntimeEvent,
  ctx: RuntimeEventContext,
): boolean {
  const { store } = ctx;

  switch (event.type) {
    case "user_question": {
      logger.log("[useRuntimeEvents] user_question received:", event);

      addActiveEventItem(
        {
          stage: "user_question",
          title: `Asked ${event.title}`,
          summary: `${event.options.length} option(s) presented to the user.`,
          status: "pending",
          timestamp: event.timestamp,
          metadata: { questionId: event.questionId, mode: event.mode },
        },
        ctx,
      );

      store.setActiveQuestion({
        questionId: event.questionId,
        title: event.title,
        question: event.question,
        mode: event.mode,
        options: event.options,
        timeoutMs: event.timeoutMs,
        defaultAnswer: event.defaultAnswer,
      });

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "User Question",
          description: `Asked: ${event.title}`,
          status: "pending",
        });
      }
      return true;
    }

    case "user_answer": {
      const source = event.isTimeout ? " (timeout)" : "";

      store.clearActiveQuestion();
      addActiveEventItem(
        {
          stage: "user_answer",
          title: "User answered",
          summary: event.isTimeout
            ? "Question timed out."
            : event.answers.join(", "),
          status: event.isTimeout ? "warning" : "success",
          timestamp: event.timestamp,
          metadata: { questionId: event.questionId },
        },
        ctx,
      );

      if (ctx.currentActivityContextId) {
        store.addActivityItem(ctx.currentActivityContextId, {
          category: "execution",
          context: "User Answer",
          description: `Answered${source}: ${event.answers.join(", ")}`,
          status: "success",
        });
      }
      return true;
    }

    default:
      return false;
  }
}
