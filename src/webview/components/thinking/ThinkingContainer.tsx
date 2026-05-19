import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { ThinkingTimelineItem } from '../../store/slices/chatSlice';

interface ThinkingContainerProps {
  readonly items: readonly ThinkingTimelineItem[];
  readonly defaultExpanded?: boolean;
}

export default function ThinkingContainer({
  items,
  defaultExpanded = false,
}: ThinkingContainerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (items.length === 0) {
    return null;
  }

  const summary = buildCompactSummary(items);
  const warnings = items.filter((item) => item.status === 'warning').length;
  const errors = items.filter((item) => item.status === 'error').length;

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
        <span className="text-[10px] opacity-80">⌕</span>
        <span className="truncate">{summary}</span>
        <span className="text-[10px] opacity-70">
          {items.length} {items.length === 1 ? 'step' : 'steps'}
        </span>
        {warnings > 0 && (
          <span className="text-[10px] text-[var(--vscode-terminal-ansiYellow)]">
            {warnings} warning
          </span>
        )}
        {errors > 0 && (
          <span className="text-[10px] text-[var(--vscode-terminal-ansiRed)]">
            {errors} error
          </span>
        )}
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
              {items.map((item) => (
                <ThinkingTimelineRow key={item.id} item={item} />
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
}: {
  readonly item: ThinkingTimelineItem;
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
        {item.summary && (
          <span className="opacity-75"> - {item.summary}</span>
        )}
      </div>
    </div>
  );
}

function buildCompactSummary(items: readonly ThinkingTimelineItem[]): string {
  const stages = new Set(items.map((item) => item.stage));
  const labels: string[] = [];

  if (stages.has('analyzing_request')) {
    labels.push('Analyzed request');
  }

  if (stages.has('checking_context') || stages.has('collecting_evidence')) {
    labels.push('Checked context');
  }

  if (stages.has('summarizing_observation') || stages.has('reflecting')) {
    labels.push('Reviewed observations');
  }

  if (stages.has('validating_response')) {
    labels.push('Validated answer');
  }

  if (labels.length === 0) {
    return items[items.length - 1]?.title ?? 'Thinking activity';
  }

  return labels.slice(0, 3).join(', ');
}
