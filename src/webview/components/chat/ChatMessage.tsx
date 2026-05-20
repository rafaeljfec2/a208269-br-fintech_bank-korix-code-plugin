/**
 * ChatMessage - Main message component with markdown and compact runtime events
 */

import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import MarkdownContent from './MarkdownContent';
import StatusCard from './StatusCard';
import StreamingIndicator from './StreamingIndicator';
import ThinkingContainer from '../thinking/ThinkingContainer';
import type {
  ThinkingTimelineItem,
  ToolExecution,
} from '../../store/slices/chatSlice';

interface MessageMetadata {
  readonly thinking?: {
    readonly items: readonly ThinkingTimelineItem[];
    readonly isExpanded: boolean;
  };
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
  const isUser = message.role === 'user';
  const messageContainer = clsx(
    'my-2 flex w-full',
    isUser ? 'justify-end px-3' : 'justify-start px-3'
  );
  const messageSurface = clsx(
    isUser
      ? [
          'max-w-[82%] rounded-2xl rounded-br-md px-3 py-2',
          'bg-[var(--vscode-input-background)]',
          'border border-[var(--vscode-panel-border)]',
          'shadow-sm',
        ]
      : 'w-full'
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={messageContainer}
    >
      <div className={messageSurface}>
        {/* Message Content */}
        {message.content && (
          <div className="text-sm leading-relaxed">
            {isUser ? (
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--vscode-foreground)]">
                {message.content}
              </div>
            ) : (
              <MarkdownContent content={message.content} />
            )}
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

        {/* Safe Thinking Timeline */}
        {message.metadata?.thinking && message.metadata.thinking.items.length > 0 && (
          <ThinkingContainer
            items={message.metadata.thinking.items}
            defaultExpanded={message.metadata.thinking.isExpanded}
          />
        )}
      </div>
    </motion.div>
  );
}
