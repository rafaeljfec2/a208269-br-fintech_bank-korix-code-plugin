/**
 * AskUserQuestion tool - Interactive structured questions
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import { askUserQuestion } from "../core/runtime/userQuestion";
import type { RuntimeEventEmitter } from "../core/runtime/runtimeEvents";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const MAX_HEADER_LENGTH = 12;
const MAX_LABEL_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;

const connectorWords = /\b(de|do|da|dos|das|of|the|a|an)\b/gi;

const RequiredTextSchema = z
  .string()
  .transform(normalizeText)
  .pipe(z.string().min(1));

const QuestionOptionSchema = z.object({
  label: RequiredTextSchema.transform((value) =>
    truncateText(value, MAX_LABEL_LENGTH),
  ).describe("Option label (5-10 words max)"),
  description: RequiredTextSchema.transform((value) =>
    truncateText(value, MAX_DESCRIPTION_LENGTH),
  )
    .describe("Why choose this? Trade-offs? Impact? (2 sentences max)"),
});

const QuestionSchema = z.object({
  question: RequiredTextSchema.pipe(z.string().min(5)).describe(
    "Clear, specific question ending with ?",
  ),
  header: RequiredTextSchema.transform(compactHeader).describe(
    "Short label, normalized to fit the compact chat form",
  ),
  multiSelect: z
    .boolean()
    .describe(
      "true for checkboxes (pick many), false for radio buttons (pick one)",
    ),
  options: z
    .array(QuestionOptionSchema)
    .min(2)
    .max(4)
    .describe("2-4 options with balanced descriptions"),
});

const AskUserQuestionInputSchema = z.object({
  questions: z
    .array(QuestionSchema)
    .min(1)
    .max(4)
    .describe("1-4 questions to ask the user"),
});

type AskUserQuestionInput = z.infer<typeof AskUserQuestionInputSchema>;
type UserAnswers = Record<string, string | string[]>;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compactHeader(value: string): string {
  const withoutConnectors = normalizeText(value.replace(connectorWords, " "));
  const candidate = withoutConnectors.length >= 3 ? withoutConnectors : value;
  return truncateText(candidate, MAX_HEADER_LENGTH);
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trimEnd();
}

export const AskUserQuestionTool: Tool<AskUserQuestionInput, UserAnswers> = {
  name: "AskUserQuestion",
  description: `Present structured multiple-choice questions when the user must CHOOSE between valid technical approaches.

Use this tool ONLY when:
- User explicitly asks to "choose between" or "compare" options
- Multiple valid technical solutions exist AND user preference matters
- User says "show me options" or "present alternatives"

DO NOT use for:
- Questions with factual answers (explain directly)
- Trivial/social queries (respond directly)
- Technical questions with one correct answer

Present 2-4 options with clear trade-offs. User can select or provide custom input.

Example: "which database should I use for 1M users: Postgres or MongoDB?" → Present comparison with trade-offs.`,

  schema: AskUserQuestionInputSchema,
  isInteractive: true,

  async execute(
    input: AskUserQuestionInput,
    _context: ToolContext,
  ): Promise<ToolResult<UserAnswers>> {
    const startTime = Date.now();
    console.log("[AskUserQuestionTool] execute() called with input:", JSON.stringify(input, null, 2));

    try {
      // Get RuntimeEventEmitter from DI container
      const container = getGlobalContainer();
      console.log("[AskUserQuestionTool] Got container");

      const emitter =
        container.get<RuntimeEventEmitter>(TOKENS.RuntimeEventEmitter);
      console.log("[AskUserQuestionTool] Got emitter:", !!emitter);

      if (!emitter) {
        throw new Error("RuntimeEventEmitter not available in DI container");
      }

      // Ask all questions and collect answers
      const answers: UserAnswers = {};

      for (const q of input.questions) {
        console.log("[AskUserQuestionTool] Asking question:", q.question);

        const userAnswers = await askUserQuestion(emitter, {
          title: q.header,
          question: q.question,
          mode: q.multiSelect ? "multiple" : "single",
          options: q.options.map((opt) => ({
            value: opt.label.toLowerCase().replace(/\s+/g, "_"),
            label: opt.label,
            description: opt.description,
          })),
          timeoutMs: 60000, // 1 minute timeout
        });

        console.log("[AskUserQuestionTool] Received answers:", userAnswers);

        // Store answers keyed by question text
        answers[q.question] = q.multiSelect ? userAnswers : userAnswers[0] ?? "";
      }

      console.log("[AskUserQuestionTool] All questions answered:", answers);

      return {
        success: true,
        data: answers,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    } catch (error) {
      console.error("[AskUserQuestionTool] ERROR:", error);

      return {
        success: false,
        error: `AskUserQuestion failed: ${(error as Error).message}\n${(error as Error).stack}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },

  requiresApproval(_input, _context): boolean {
    // Questions always require user interaction (implicit approval)
    return false;
  },

  allowedInMode(_mode): boolean {
    // Questions work in ALL modes (ask, agent, plan, chat)
    return true;
  },
};
