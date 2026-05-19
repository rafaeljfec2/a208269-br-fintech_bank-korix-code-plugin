/**
 * Safety hook: Force clear execution state after timeout
 * Prevents UI from staying frozen if done event is lost
 */
import { useEffect } from "react";
import { useStore } from "../store";
import { logger } from "../utils/logger";

// Review recommendation: 120s instead of 60s (conservative)
const EXECUTION_TIMEOUT_MS = 120_000; // 120 seconds

export function useExecutionTimeout() {
  const isExecuting = useStore((state) => state.isExecuting);
  const setExecuting = useStore((state) => state.setExecuting);

  useEffect(() => {
    if (!isExecuting) return;

    logger.log("[ExecutionTimeout] Started timeout guard", {
      timeoutMs: EXECUTION_TIMEOUT_MS,
    });

    const timeout = setTimeout(() => {
      logger.warn("[ExecutionTimeout] TIMEOUT - forcing isExecuting=false after", {
        timeoutMs: EXECUTION_TIMEOUT_MS,
      });
      setExecuting(false);
    }, EXECUTION_TIMEOUT_MS);

    return () => {
      logger.log("[ExecutionTimeout] Cleared timeout (execution finished normally)");
      clearTimeout(timeout);
    };
  }, [isExecuting, setExecuting]);
}
