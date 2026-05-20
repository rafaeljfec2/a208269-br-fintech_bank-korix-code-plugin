import React, { useCallback } from 'react';
import { useStore } from '../../store';
import { useVSCode } from '../../hooks/useVSCode';
import { logger } from '../../utils/logger';
import QuestionCard from './QuestionCard';

export default function ActiveQuestionPanel() {
  const activeQuestion = useStore((state) => state.activeQuestion);
  const clearActiveQuestion = useStore((state) => state.clearActiveQuestion);
  const { sendMessage } = useVSCode();

  const resolveDefaultAnswers = useCallback((): string[] => {
    if (!activeQuestion) {
      return [];
    }

    if (Array.isArray(activeQuestion.defaultAnswer)) {
      return activeQuestion.defaultAnswer;
    }

    if (activeQuestion.defaultAnswer) {
      return [activeQuestion.defaultAnswer];
    }

    return [activeQuestion.options[0]?.value ?? ""];
  }, [activeQuestion]);

  const submitAnswers = useCallback(
    (answers: string[], source: 'manual' | 'timeout' | 'cancel') => {
      if (!activeQuestion) {
        return;
      }

      logger.log("[ActiveQuestionPanel] submitting answer", {
        questionId: activeQuestion.questionId,
        source,
        answers,
      });

      sendMessage({
        type: "answer_question",
        payload: {
          questionId: activeQuestion.questionId,
          answers,
        },
      });

      clearActiveQuestion();
    },
    [activeQuestion, clearActiveQuestion, sendMessage],
  );

  const handleSubmit = useCallback(
    (answers: string[]) => submitAnswers(answers, 'manual'),
    [submitAnswers],
  );

  const handleTimeout = useCallback(() => {
    submitAnswers(resolveDefaultAnswers(), 'timeout');
  }, [resolveDefaultAnswers, submitAnswers]);

  const handleCancel = useCallback(() => {
    submitAnswers(resolveDefaultAnswers(), 'cancel');
  }, [resolveDefaultAnswers, submitAnswers]);

  if (!activeQuestion) {
    return null;
  }

  return (
    <div className="pb-2">
      <QuestionCard
        questionId={activeQuestion.questionId}
        title={activeQuestion.title}
        question={activeQuestion.question}
        mode={activeQuestion.mode}
        options={activeQuestion.options}
        timeoutMs={activeQuestion.timeoutMs}
        onSubmit={handleSubmit}
        onTimeout={handleTimeout}
        onCancel={handleCancel}
      />
    </div>
  );
}
