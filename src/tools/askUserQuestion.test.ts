import { describe, expect, it, vi } from "vitest";
import { createContainer, setGlobalContainer } from "../di/container";
import { TOKENS } from "../di/tokens";
import { RuntimeEventEmitter } from "../core/runtime/runtimeEvents";
import type { ToolContext } from "../harness/toolRegistry";
import { AskUserQuestionTool } from "./askUserQuestion";

describe("AskUserQuestionTool", () => {
  const context: ToolContext = {
    execution: {
      mode: "ask",
      workspaceRoot: "/workspace",
      openFiles: [],
    },
    workspaceRoot: "/workspace",
  };

  it("should normalize long provider text and still emit the options panel", async () => {
    const emitter = new RuntimeEventEmitter();
    const eventSpy = vi.fn();
    const container = createContainer();
    container.bindValue(TOKENS.RuntimeEventEmitter, emitter);
    setGlobalContainer(container);
    emitter.onEvent(eventSpy);

    const parsed = AskUserQuestionTool.schema.safeParse({
      questions: [
        {
          question: "Qual banco de dados você quer usar?",
          header: "Banco de Dados",
          multiSelect: false,
          options: [
            {
              label: "PostgreSQL",
              description: "Relacional robusto para dados estruturados.",
            },
            {
              label: "MongoDB",
              description: "Documental flexível para dados semi-estruturados.",
            },
            {
              label: "MySQL",
              description: "Relacional maduro e amplamente adotado.",
            },
            {
              label: "Redis",
              description: "Chave-valor em memória para cache e filas.",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    const promise = AskUserQuestionTool.execute(parsed.data, context);
    const questionEvent = eventSpy.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === "user_question");

    expect(questionEvent).toEqual(
      expect.objectContaining({
        type: "user_question",
        title: "Banco Dados",
        question: "Qual banco de dados você quer usar?",
        mode: "single",
      }),
    );

    emitter.emitEvent({
      type: "user_answer",
      questionId: questionEvent.questionId,
      answers: ["mongodb"],
      isTimeout: false,
      timestamp: Date.now(),
    });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      "Qual banco de dados você quer usar?": "mongodb",
    });
  });
});
