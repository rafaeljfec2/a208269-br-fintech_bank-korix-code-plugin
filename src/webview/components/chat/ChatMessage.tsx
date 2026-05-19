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
import QuestionCard from './QuestionCard';
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
  const [timelineExpanded, setTimelineExpanded] = useState(
    message.metadata?.execution?.isExpanded ?? false
  );

  // Chat fluido - SEM avatares, SEM labels ("You", "Korix")
  // Diferenciação visual APENAS por background
  // Status cards sem content ficam mais compactos (status bar style)
  const hasOnlyStatusCard = !message.content && message.metadata?.statusCard;
  const messageContainer = clsx(
    hasOnlyStatusCard ? 'px-3 py-1' : 'px-3 py-3 my-2',
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

      {/* Execution Timeline */}
      {message.metadata?.execution && message.metadata.execution.tools.length > 0 && (
        <ExecutionTimeline
          tools={message.metadata.execution.tools}
          isExpanded={timelineExpanded}
          onToggle={() => setTimelineExpanded(!timelineExpanded)}
        />
      )}
    </motion.div>
  );
}
