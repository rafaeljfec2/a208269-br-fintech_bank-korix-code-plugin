/**
 * User question utilities - interactive prompts with multiple choice
 *
 * Allows the runtime to ask the user questions with predefined options,
 * supporting both single and multiple selection modes with optional timeout.
 */

import type { RuntimeEventEmitter } from "./runtimeEvents";

export interface AskQuestionOptions {
  readonly title: string;
  readonly question: string;
  readonly mode?: "single" | "multiple";
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly description: string;
  }[];
  readonly timeoutMs?: number;
  readonly defaultAnswer?: string | string[];
}

/**
 * Ask the user a question with multiple choice options
 *
 * Emits a user_question event and waits for a user_answer event.
 * If timeoutMs is provided, resolves with defaultAnswer after timeout.
 *
 * @param emitter - Runtime event emitter
 * @param config - Question configuration
 * @returns Promise resolving to array of selected values
 * @throws Error if validation fails
 */
export async function askUserQuestion(
  emitter: RuntimeEventEmitter,
  config: AskQuestionOptions,
): Promise<string[]> {
  // Validate inputs
  if (!config.title || config.title.trim().length === 0) {
    throw new Error("Question title is required");
  }

  if (!config.question || config.question.trim().length === 0) {
    throw new Error("Question text is required");
  }

  if (config.options.length < 2) {
    throw new Error("At least 2 options are required");
  }

  if (config.options.length > 10) {
    throw new Error("Maximum 10 options allowed");
  }

  // Validate timeout bounds
  if (config.timeoutMs !== undefined) {
    if (config.timeoutMs < 5000) {
      throw new Error("Timeout must be at least 5 seconds (5000ms)");
    }
    if (config.timeoutMs > 300000) {
      throw new Error("Timeout must be at most 5 minutes (300000ms)");
    }
  }

  // Validate options
  for (const option of config.options) {
    if (!option.value || option.value.trim().length === 0) {
      throw new Error("Option value is required");
    }
    if (!option.label || option.label.trim().length === 0) {
      throw new Error("Option label is required");
    }
    if (!option.description || option.description.trim().length === 0) {
      throw new Error("Option description is required");
    }
  }

  const questionId = crypto.randomUUID();
  const mode = config.mode ?? "single";

  // Emit user_question event
  console.log("[askUserQuestion] About to emit user_question event", {
    questionId,
    title: config.title,
    question: config.question,
    mode,
    optionsCount: config.options.length,
  });

  emitter.emitEvent({
    type: "user_question",
    questionId,
    title: config.title,
    question: config.question,
    mode,
    options: config.options,
    timeoutMs: config.timeoutMs,
    defaultAnswer: config.defaultAnswer,
    timestamp: Date.now(),
  });

  console.log("[askUserQuestion] user_question event emitted successfully");

  // Wait for user_answer via promise (with guaranteed cleanup)
  return new Promise((resolve) => {
    // eslint-disable-next-line prefer-const -- timeoutHandle is assigned later after cleanup function is defined
    let timeoutHandle: NodeJS.Timeout | undefined;
    let isResolved = false;

    // Cleanup function ensures listener is always disposed
    const cleanup = () => {
      if (isResolved) return;
      isResolved = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      listener.dispose();
    };

    const listener = emitter.onType("user_answer", (event) => {
      if (event.questionId === questionId) {
        cleanup();
        resolve(event.answers);
      }
    });

    // Safety timeout: use provided timeout or default to 5 minutes
    const effectiveTimeout = config.timeoutMs ?? 300000;

    timeoutHandle = setTimeout(() => {
      cleanup();

      // Resolve with default answer
      const defaultAnswers = Array.isArray(config.defaultAnswer)
        ? config.defaultAnswer
        : config.defaultAnswer
          ? [config.defaultAnswer]
          : [config.options[0]?.value ?? ""];

      // Emit timeout event
      emitter.emitEvent({
        type: "user_answer",
        questionId,
        answers: defaultAnswers,
        isTimeout: true,
        timestamp: Date.now(),
      });

      resolve(defaultAnswers);
    }, effectiveTimeout);
  });
}

/**
 * Ask a single-choice question (radio buttons)
 *
 * Helper for common case of selecting one option.
 *
 * @param emitter - Runtime event emitter
 * @param title - Question title
 * @param question - Question text
 * @param options - Available options
 * @param timeoutMs - Optional timeout in milliseconds
 * @returns Promise resolving to selected value
 */
export async function askSingleChoice(
  emitter: RuntimeEventEmitter,
  title: string,
  question: string,
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly description: string;
  }[],
  timeoutMs?: number,
): Promise<string> {
  const answers = await askUserQuestion(emitter, {
    title,
    question,
    mode: "single",
    options,
    timeoutMs,
    defaultAnswer: options[0]?.value,
  });
  return answers[0] ?? "";
}

/**
 * Ask a multiple-choice question (checkboxes)
 *
 * Helper for selecting multiple options.
 *
 * @param emitter - Runtime event emitter
 * @param title - Question title
 * @param question - Question text
 * @param options - Available options
 * @param timeoutMs - Optional timeout in milliseconds
 * @returns Promise resolving to array of selected values
 */
export async function askMultipleChoice(
  emitter: RuntimeEventEmitter,
  title: string,
  question: string,
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly description: string;
  }[],
  timeoutMs?: number,
): Promise<string[]> {
  return askUserQuestion(emitter, {
    title,
    question,
    mode: "multiple",
    options,
    timeoutMs,
  });
}
