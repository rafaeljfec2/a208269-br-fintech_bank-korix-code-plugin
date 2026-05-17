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

export default function ExecutionTimeline({
  tools,
  isExpanded,
  onToggle,
}: ExecutionTimelineProps) {
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
        <div className="text-xs opacity-50">
          {tools.length} ferramenta{tools.length !== 1 ? 's' : ''} usada{tools.length !== 1 ? 's' : ''}
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
