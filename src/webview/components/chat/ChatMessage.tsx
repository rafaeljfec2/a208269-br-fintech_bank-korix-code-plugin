/**
 * ChatMessage - Main message component with markdown, timeline, and status cards
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import MarkdownContent from './MarkdownContent';
import ExecutionTimeline from './ExecutionTimeline';
import StatusCard from './StatusCard';
import StreamingIndicator from './StreamingIndicator';
import type { ToolExecution } from './ToolExecutionItem';

interface MessageMetadata {
  readonly execution?: {
    readonly tools: ToolExecution[];
    readonly isExpanded: boolean;
    readonly totalDuration: number;
  };
  readonly statusCard?: {
    readonly type: 'plan_created' | 'completed' | 'error';
    readonly title: string;
    readonly subtitle?: string;
    readonly action?: {
      readonly label: string;
      readonly onClick: () => void;
    };
  };
}

export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: number;
  readonly isStreaming?: boolean;
  readonly metadata?: MessageMetadata;
}

interface ChatMessageProps {
  readonly message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [timelineExpanded, setTimelineExpanded] = useState(
    message.metadata?.execution?.isExpanded ?? false
  );

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Classes
  const messageContainer = clsx(
    'flex gap-3 px-4 py-3',
    message.role === 'user' && 'flex-row-reverse'
  );

  const avatar = clsx(
    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
    message.role === 'assistant'
      ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
      : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)] opacity-60'
  );

  const header = 'flex items-center justify-between mb-2 text-xs opacity-60';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={messageContainer}
    >
      {/* Avatar */}
      <div className={avatar}>{message.role === 'assistant' ? 'K' : 'U'}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className={header}>
          <span>{message.role === 'user' ? 'You' : 'Korix'}</span>
          <span>{formatTime(message.timestamp)}</span>
        </div>

        {/* Message Content */}
        {message.content && (
          <div className="text-sm leading-relaxed">
            <MarkdownContent content={message.content} />
            {message.isStreaming && <StreamingIndicator />}
          </div>
        )}

        {/* Status Card */}
        {message.metadata?.statusCard && (
          <StatusCard
            type={message.metadata.statusCard.type}
            title={message.metadata.statusCard.title}
            subtitle={message.metadata.statusCard.subtitle}
            action={message.metadata.statusCard.action}
          />
        )}

        {/* Execution Timeline */}
        {message.metadata?.execution && message.metadata.execution.tools.length > 0 && (
          <ExecutionTimeline
            tools={message.metadata.execution.tools}
            isExpanded={timelineExpanded}
            onToggle={() => setTimelineExpanded(!timelineExpanded)}
          />
        )}
      </div>
    </motion.div>
  );
}
