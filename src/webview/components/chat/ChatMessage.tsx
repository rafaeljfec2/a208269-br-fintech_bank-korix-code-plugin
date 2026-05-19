/**
 * ChatMessage - Main message component with markdown and compact runtime events
 */

import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import MarkdownContent from './MarkdownContent';
import StatusCard from './StatusCard';
import StreamingIndicator from './StreamingIndicator';
import QuestionCard from './QuestionCard';
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
  readonly question?: {
    readonly questionId: string;
    readonly title: string;
    readonly question: string;
    readonly mode: 'single' | 'multiple';
    readonly options: readonly {
      readonly value: string;
      readonly label: string;
      readonly description: string;
    }[];
    readonly timeoutMs?: number;
    readonly onSubmit: (answers: string[]) => void;
    readonly onTimeout?: () => void;
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
  // Chat fluido - SEM avatares, SEM labels ("You", "Korix")
  // Diferenciação visual APENAS por background
  const messageContainer = clsx(
    'px-3 py-3 my-2',
    message.role === 'user' && 'bg-[var(--vscode-input-background)] rounded-lg' // Container cinza para usuário
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={messageContainer}
    >
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

      {/* Safe Thinking Timeline */}
      {message.metadata?.thinking && message.metadata.thinking.items.length > 0 && (
        <ThinkingContainer
          items={message.metadata.thinking.items}
          defaultExpanded={message.metadata.thinking.isExpanded}
        />
      )}

      {/* Question Card */}
      {message.metadata?.question && (
        <QuestionCard
          questionId={message.metadata.question.questionId}
          title={message.metadata.question.title}
          question={message.metadata.question.question}
          mode={message.metadata.question.mode}
          options={message.metadata.question.options}
          timeoutMs={message.metadata.question.timeoutMs}
          onSubmit={message.metadata.question.onSubmit}
          onTimeout={message.metadata.question.onTimeout}
        />
      )}
    </motion.div>
  );
}
