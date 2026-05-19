import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { ThinkingTimelineItem } from '../../store/slices/chatSlice';

interface ThinkingContainerProps {
  readonly items: readonly ThinkingTimelineItem[];
  readonly defaultExpanded?: boolean;
  readonly active?: boolean;
}

export default function ThinkingContainer({
  items,
  defaultExpanded = false,
  active = false,
}: ThinkingContainerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [dotCount, setDotCount] = useState(3);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      setDotCount((current) => (current >= 3 ? 1 : current + 1));
    }, 420);

    return () => window.clearInterval(timer);
  }, [active]);

  if (items.length === 0) {
    return null;
  }

  const visibleItems = active ? items : buildCompletedItems(items);
  if (visibleItems.length === 0) {
    return null;
  }

  const dots = '.'.repeat(dotCount);
  const headerLabel = active ? `thinking ${dots}` : 'thought';

  const headerClass = clsx(
    'group inline-flex max-w-full items-center gap-1.5 py-1 cursor-pointer',
    'text-[11px] leading-none text-[var(--vscode-descriptionForeground)]',
    'hover:text-[var(--vscode-foreground)] transition-colors'
  );

  return (
    <div className="my-1 text-xs">
      <button
        type="button"
        className={headerClass}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="w-3 text-[10px]">{expanded ? '⌄' : '›'}</span>
        <span className="truncate">{headerLabel}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-6 space-y-1 text-[11px] leading-snug text-[var(--vscode-descriptionForeground)]">
              {visibleItems.map((item) => (
                <ThinkingTimelineRow
                  key={item.id}
                  item={item}
                  compact={!active}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingTimelineRow({
  item,
  compact = false,
}: {
  readonly item: ThinkingTimelineItem;
  readonly compact?: boolean;
}) {
  const iconClass = clsx(
    'w-3 flex-shrink-0 text-[10px]',
    item.status === 'success' && 'text-[var(--vscode-terminal-ansiGreen)]',
    item.status === 'warning' && 'text-[var(--vscode-terminal-ansiYellow)]',
    item.status === 'error' && 'text-[var(--vscode-terminal-ansiRed)]',
    item.status === 'pending' && 'text-[var(--vscode-descriptionForeground)]'
  );

  const icon =
    item.status === 'success'
      ? '✓'
      : item.status === 'error'
      ? '✗'
      : item.status === 'warning'
      ? '!'
      : '•';

  return (
    <div className="flex max-w-full gap-1.5">
      <span className={iconClass}>{icon}</span>
      <div className="min-w-0 flex-1 truncate">
        <span>{item.title}</span>
        {!compact && item.summary && (
          <span className="opacity-75"> - {item.summary}</span>
        )}
      </div>
    </div>
  );
}

function buildCompletedItems(
  items: readonly ThinkingTimelineItem[],
): readonly ThinkingTimelineItem[] {
  const completed: ThinkingTimelineItem[] = [];

  addNormalizedItem(completed, items, {
    stages: ["analyzing_request"],
    title: "Analyzed request",
  });

  addNormalizedItem(completed, items, {
    stages: ["context_evidence", "checking_context", "collecting_evidence"],
    title: "Checked context",
  });

  addToolSummary(completed, items);

  addNormalizedItem(completed, items, {
    stages: [
      "observation_summary",
      "summarizing_observation",
      "reflection_summary",
      "reflecting",
    ],
    title: "Reviewed observations",
  });

  addNormalizedItem(completed, items, {
    stages: ["response_validation", "validating_response"],
    title: "Validated answer",
  });

  addNormalizedItem(completed, items, {
    stages: ["execution_complete", "done"],
    title: "Completed",
  });

  if (completed.length > 0) {
    return completed;
  }

  const last = items[items.length - 1];
  return last
    ? [
        {
          ...last,
          id: `${last.id}-completed-fallback`,
          title: "Completed",
          summary: "",
          status: last.status === "error" ? "error" : "success",
        },
      ]
    : [];
}

function addNormalizedItem(
  target: ThinkingTimelineItem[],
  items: readonly ThinkingTimelineItem[],
  options: {
    readonly stages: readonly string[];
    readonly title: string;
  },
): void {
  const source = [...items]
    .reverse()
    .find((item) => options.stages.includes(item.stage));

  if (!source) {
    return;
  }

  target.push({
    ...source,
    id: `${source.id}-completed-${options.title}`,
    title: options.title,
    summary: "",
    status: source.status === "pending" ? "success" : source.status,
  });
}

function addToolSummary(
  target: ThinkingTimelineItem[],
  items: readonly ThinkingTimelineItem[],
): void {
  const toolResults = items.filter((item) => item.stage === "tool_result");
  if (toolResults.length === 0) {
    return;
  }

  const hasFailure = toolResults.some((item) => item.status === "error");
  const lastTool = toolResults[toolResults.length - 1];
  if (!lastTool) {
    return;
  }

  target.push({
    ...lastTool,
    id: `${lastTool.id}-completed-tools`,
    title: `Used ${toolResults.length} ${toolResults.length === 1 ? "tool" : "tools"}`,
    summary: "",
    status: hasFailure ? "error" : "success",
  });
}
