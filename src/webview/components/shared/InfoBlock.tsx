/**
 * InfoBlock - Semantic blockquote component
 *
 * Renders markdown blockquotes with visual styling based on type.
 * Supports 6 semantic types: note, warning, error, success, tip, important.
 *
 * Usage in markdown (via remark-directive):
 * :::warning
 * This is a warning message
 * :::
 */

import React from 'react';

type InfoBlockType = 'note' | 'warning' | 'error' | 'success' | 'tip' | 'important';

interface InfoBlockProps {
  readonly children: React.ReactNode;
  readonly type?: InfoBlockType;
}

const typeConfig: Record<InfoBlockType, { icon: string; bg: string; border: string; text: string }> = {
  note: {
    icon: 'ℹ️',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/50',
    text: 'text-blue-400',
  },
  warning: {
    icon: '⚠️',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/50',
    text: 'text-yellow-400',
  },
  error: {
    icon: '❌',
    bg: 'bg-red-500/10',
    border: 'border-red-500/50',
    text: 'text-red-400',
  },
  success: {
    icon: '✅',
    bg: 'bg-green-500/10',
    border: 'border-green-500/50',
    text: 'text-green-400',
  },
  tip: {
    icon: '💡',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/50',
    text: 'text-purple-400',
  },
  important: {
    icon: '⛔',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/50',
    text: 'text-orange-400',
  },
};

export function InfoBlock({ children, type = 'note' }: InfoBlockProps) {
  const config = typeConfig[type];

  return (
    <div className={`my-4 px-3 py-2 border-l-4 ${config.border} ${config.bg} rounded-r`}>
      <div className="flex gap-2">
        <span className="text-lg flex-shrink-0">{config.icon}</span>
        <div className="flex-1 prose prose-sm max-w-none">
          {children}
        </div>
      </div>
    </div>
  );
}
