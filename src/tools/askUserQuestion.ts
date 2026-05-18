/**
 * AskUserQuestion tool - Interactive structured questions
 */

import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../harness/toolRegistry";
import { askUserQuestion } from "../core/runtime/userQuestion";
import type { RuntimeEventEmitter } from "../core/runtime/runtimeEvents";
import { getGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";

const QuestionOptionSchema = z.object({
  label: z.string().min(1).max(50).describe("Option label (5-10 words max)"),
  description: z
    .string()
    .min(1)
    .max(200)
    .describe("Why choose this? Trade-offs? Impact? (2 sentences max)"),
});

const QuestionSchema = z.object({
  question: z
    .string()
    .min(5)
    .describe("Clear, specific question ending with ?"),
  header: z.string().min(1).max(12).describe("Short label (max 12 chars)"),
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

export const AskUserQuestionTool: Tool<AskUserQuestionInput, UserAnswers> = {
  name: "AskUserQuestion",
  description: `CRITICAL: You MUST use this tool when the user asks for recommendations or multiple options exist.

ALWAYS use AskUserQuestion when:
- User asks "which X?", "what Y?", "recommend Z"
- Multiple valid options exist (databases, frameworks, approaches, strategies)
- User needs to choose between alternatives
- Making architectural or technology decisions

Present 2-4 options with clear descriptions. User can select or provide custom "Other" text.

Example: User asks "qual banco de dados você recomenda?" → IMMEDIATELY use AskUserQuestion with PostgreSQL, MongoDB, MySQL, Redis options. DO NOT answer in plain text.`,

  schema: AskUserQuestionInputSchema,

  async execute(
    input: AskUserQuestionInput,
    _context: ToolContext,
  ): Promise<ToolResult<UserAnswers>> {
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
          questionCount: input.questions.length,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error("[AskUserQuestionTool] ERROR:", error);

      return {
        success: false,
        error: `AskUserQuestion failed: ${(error as Error).message}\n${(error as Error).stack}`,
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
