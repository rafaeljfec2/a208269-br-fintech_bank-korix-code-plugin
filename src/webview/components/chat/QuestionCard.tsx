/**
 * QuestionCard - Interactive multiple choice question component
 *
 * Renders questions with radio buttons (single choice) or checkboxes (multiple choice).
 * Supports optional timeout with visual countdown and "Other" text input.
 */

import { logger } from "../../utils/logger";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface QuestionOption {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

interface QuestionCardProps {
  readonly questionId: string;
  readonly title: string;
  readonly question: string;
  readonly mode: 'single' | 'multiple';
  readonly options: readonly QuestionOption[];
  readonly timeoutMs?: number;
  readonly onSubmit: (answers: string[]) => void;
  readonly onTimeout?: () => void;
  readonly onCancel?: () => void;
}

export default function QuestionCard({
  questionId,
  title,
  question,
  mode,
  options,
  timeoutMs,
  onSubmit,
  onTimeout,
  onCancel,
}: QuestionCardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    timeoutMs ? Math.ceil(timeoutMs / 1000) : null
  );

  // Store callback in ref to avoid recreating interval on callback change
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Timer countdown (optimized: 1s interval instead of 100ms)
  useEffect(() => {
    if (!timeoutMs) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
      setRemainingSeconds(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        onTimeoutRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timeoutMs]); // Only depend on timeoutMs

  // Keyboard: Esc to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleChange = useCallback(
    (value: string, checked: boolean) => {
      if (mode === 'single') {
        setSelected([value]);
      } else {
        // multiple
        setSelected((prev) =>
          checked ? [...prev, value] : prev.filter((v) => v !== value)
        );
      }
    },
    [mode]
  );

  const handleSubmit = useCallback(() => {
    logger.log("[QuestionCard] handleSubmit called", { selected, otherText });

    // Build final answers array
    const trimmedOther = otherText.trim();
    const answers = selected.includes('other')
      ? [...selected.filter((v) => v !== 'other'), trimmedOther]
      : selected;

    logger.log("[QuestionCard] Built answers:", answers);

    // Validate: Other must have text with min length
    if (selected.includes('other') && trimmedOther.length < 3) {
      logger.log("[QuestionCard] Validation failed: Other text too short");
      return; // Don't submit if Other is selected but too short
    }

    logger.log("[QuestionCard] Calling onSubmit with:", answers);
    onSubmit(answers);
  }, [selected, otherText, onSubmit]);

  const isOtherSelected = selected.includes('other');
  const trimmedOther = otherText.trim();
  const isSubmitDisabled =
    selected.length === 0 ||
    (isOtherSelected && trimmedOther.length < 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="border border-[var(--vscode-panel-border)] rounded p-2 bg-[var(--vscode-editor-background)] max-h-[70vh] overflow-y-auto"
    >
      {/* Title + Timer na mesma linha */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-[var(--vscode-foreground)]">
          {title}
        </h3>
        {remainingSeconds !== null && remainingSeconds > 0 && (
          <span className="text-xs text-[var(--vscode-charts-yellow)]">
            ⏱ {remainingSeconds}s
          </span>
        )}
      </div>

      {/* Question */}
      <p className="text-xs mb-2 text-[var(--vscode-descriptionForeground)] leading-tight">
        {question}
      </p>

      {/* Options */}
      <div className="space-y-1 mb-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={clsx(
              'flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors',
              'hover:bg-[var(--vscode-list-hoverBackground)]',
              selected.includes(option.value) &&
                'bg-[var(--vscode-list-activeSelectionBackground)]'
            )}
          >
            <input
              type={mode === 'single' ? 'radio' : 'checkbox'}
              name={mode === 'single' ? questionId : undefined}
              value={option.value}
              checked={selected.includes(option.value)}
              onChange={(e) => handleChange(option.value, e.target.checked)}
              className="mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <div className="text-xs font-medium text-[var(--vscode-foreground)]">
                {option.label}
              </div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)] leading-tight">
                {option.description}
              </div>
            </div>
          </label>
        ))}

        {/* Other option - always present */}
        <label
          className={clsx(
            'flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors',
            'hover:bg-[var(--vscode-list-hoverBackground)]',
            isOtherSelected && 'bg-[var(--vscode-list-activeSelectionBackground)]'
          )}
        >
          <input
            type={mode === 'single' ? 'radio' : 'checkbox'}
            name={mode === 'single' ? questionId : undefined}
            value="other"
            checked={isOtherSelected}
            onChange={(e) => handleChange('other', e.target.checked)}
            className="mt-0.5 flex-shrink-0"
          />
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--vscode-foreground)]">
              Other
            </div>
            {isOtherSelected && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Digite sua resposta..."
                className={clsx(
                  'w-full mt-1 p-1.5 text-xs rounded',
                  'bg-[var(--vscode-input-background)]',
                  'text-[var(--vscode-input-foreground)]',
                  'border border-[var(--vscode-input-border)]',
                  'focus:outline-none focus:border-[var(--vscode-focusBorder)]',
                  'resize-none'
                )}
                rows={2}
                autoFocus
              />
            )}
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={clsx(
            'px-3 py-1 text-xs font-medium rounded',
            'bg-[var(--vscode-button-background)]',
            'text-[var(--vscode-button-foreground)]',
            'hover:bg-[var(--vscode-button-hoverBackground)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors'
          )}
        >
          Submit answers
        </button>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          Esc to cancel
        </span>
      </div>
    </motion.div>
  );
}
