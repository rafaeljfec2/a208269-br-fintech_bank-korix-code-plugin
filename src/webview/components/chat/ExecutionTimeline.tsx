/**
 * ExecutionTimeline - Expandable timeline of tool executions
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import ToolExecutionItem, { type ToolExecution } from './ToolExecutionItem';

interface ExecutionTimelineProps {
  readonly tools: ToolExecution[];
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

function ExecutionTimeline({
  tools,
  isExpanded,
  onToggle,
}: ExecutionTimelineProps) {
  // Calculate total duration
  const totalDuration = tools.reduce((sum, tool) => sum + tool.duration, 0);
  const formattedDuration = (totalDuration / 1000).toFixed(1);

  // Classes
  const expandableHeader = clsx(
    'flex items-center justify-between px-3 py-2 cursor-pointer rounded',
    'hover:bg-[var(--vscode-list-hoverBackground)] transition-colors',
    'border-t border-b border-[var(--vscode-panel-border)] my-2'
  );

  return (
    <div>
      {/* Expandable Header */}
      <div className={expandableHeader} onClick={onToggle}>
        <div className="flex items-center gap-2 text-sm">
          <span>{isExpanded ? '▼' : '▶'}</span>
          <span className="font-medium">Execução</span>
        </div>
        <div className="flex items-center gap-3 text-xs opacity-50">
          <span>
            {tools.length} ferramenta{tools.length !== 1 ? 's' : ''}
          </span>
          {totalDuration > 0 && (
            <span className="tabular-nums">
              {formattedDuration}s total
            </span>
          )}
        </div>
      </div>

      {/* Timeline Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1">
              {tools.map((tool) => (
                <ToolExecutionItem key={tool.id} tool={tool} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Memoize component to prevent re-renders when tools array hasn't changed
export default React.memo(ExecutionTimeline, (prevProps, nextProps) => {
  // Only re-render if isExpanded changed or tools array changed
  return (
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.tools.length === nextProps.tools.length &&
    prevProps.tools.every((tool, idx) => {
      const nextTool = nextProps.tools[idx];
      return (
        nextTool !== undefined &&
        tool.id === nextTool.id &&
        tool.status === nextTool.status &&
        tool.duration === nextTool.duration
      );
    })
  );
});
