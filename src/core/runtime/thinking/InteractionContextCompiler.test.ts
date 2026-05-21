import { describe, expect, it } from "vitest";
import { InteractionContextCompiler } from "./InteractionContextCompiler";
import type { ChatHistoryMessage } from "./InteractionContextCompiler";

describe("InteractionContextCompiler", () => {
  it("should compile a direct request without changing content", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "Explique TypeScript em uma frase",
      previousMessages: [],
      mode: "agent",
    });

    expect(compiled.currentMessage).toBe("Explique TypeScript em uma frase");
    expect(compiled.effectiveMessage).toBe("Explique TypeScript em uma frase");
    expect(compiled.previousMessages).toEqual([]);
    expect(compiled.omittedMessages).toEqual([]);
    expect(compiled.continuationOf).toBeUndefined();
  });

  it("should preserve history and retry text while in ask mode", () => {
    const previousMessages: readonly ChatHistoryMessage[] = [
      {
        role: "assistant",
        content: "Estou em modo ASK, sem acesso a ferramentas.",
      },
    ];

    const compiled = new InteractionContextCompiler().compile({
      message: "tente novamente",
      previousMessages,
      mode: "ask",
    });

    expect(compiled.effectiveMessage).toBe("tente novamente");
    expect(compiled.previousMessages).toBe(previousMessages);
    expect(compiled.omittedMessages).toEqual([]);
  });

  it("should remove stale ask-mode assistant claims after switching to agent", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "agora execute",
      previousMessages: [
        {
          role: "user",
          content: "olhe tres arquivos do projeto",
        },
        {
          role: "assistant",
          content:
            "Não consigo. Estou em modo ASK, sem acesso a ferramentas de leitura.",
        },
        {
          role: "assistant",
          content:
            "Continuo sem acesso às ferramentas de leitura de arquivos nesta resposta.",
        },
      ],
      mode: "agent",
    });

    expect(compiled.previousMessages).toEqual([
      {
        role: "user",
        content: "olhe tres arquivos do projeto",
      },
    ]);
    expect(compiled.omittedMessages).toEqual([
      {
        index: 1,
        role: "assistant",
        reason: "stale_mode_claim",
      },
      {
        index: 2,
        role: "assistant",
        reason: "stale_mode_claim",
      },
    ]);
  });

  it("should preserve normal assistant messages in agent mode", () => {
    const previousMessages: readonly ChatHistoryMessage[] = [
      {
        role: "assistant",
        content: "O arquivo principal fica em src/index.ts.",
      },
    ];

    const compiled = new InteractionContextCompiler().compile({
      message: "continue",
      previousMessages,
      mode: "agent",
    });

    expect(compiled.previousMessages).toEqual(previousMessages);
    expect(compiled.omittedMessages).toEqual([]);
  });

  it("should restore the previous actionable request when retrying after a stale denial", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "tente novamente",
      previousMessages: [
        {
          role: "user",
          content: "Leia tres arquivos do projeto e passe um resumo deles",
        },
        {
          role: "assistant",
          content:
            "Não consigo atender esse pedido no modo atual. Mode: ASK - sem acesso a ferramentas.",
        },
      ],
      mode: "agent",
    });

    expect(compiled.continuationOf).toBe(
      "Leia tres arquivos do projeto e passe um resumo deles",
    );
    expect(compiled.effectiveMessage).toContain(
      "Leia tres arquivos do projeto e passe um resumo deles",
    );
    expect(compiled.effectiveMessage).toContain("tente novamente");
  });

  it("should not restore a retry request when no stale denial was removed", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "try again",
      previousMessages: [
        {
          role: "user",
          content: "Explique async await",
        },
        {
          role: "assistant",
          content: "Async await simplifica Promises.",
        },
      ],
      mode: "agent",
    });

    expect(compiled.effectiveMessage).toBe("try again");
    expect(compiled.continuationOf).toBeUndefined();
  });

  it("should ignore previous retry placeholders when selecting continuation target", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "try again",
      previousMessages: [
        {
          role: "user",
          content: "Leia src/core/runtime/runtimeState.ts",
        },
        {
          role: "assistant",
          content: "Modo ASK: sem acesso ao workspace.",
        },
        {
          role: "user",
          content: "tente novamente",
        },
      ],
      mode: "agent",
    });

    expect(compiled.continuationOf).toBe(
      "Leia src/core/runtime/runtimeState.ts",
    );
    expect(compiled.continuationOf).not.toBe("tente novamente");
    expect(compiled.previousMessages).toEqual([
      {
        role: "user",
        content: "Leia src/core/runtime/runtimeState.ts",
      },
    ]);
    expect(compiled.omittedMessages).toEqual([
      {
        index: 1,
        role: "assistant",
        reason: "stale_mode_claim",
      },
      {
        index: 2,
        role: "user",
        reason: "retry_placeholder",
      },
    ]);
  });

  it("should cap previous messages while preserving the most recent eligible history", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "continue",
      previousMessages: [
        {
          role: "user",
          content: "old request",
        },
        {
          role: "assistant",
          content: "old answer",
        },
        {
          role: "user",
          content: "recent request",
        },
      ],
      mode: "agent",
      maxPreviousMessages: 2,
    });

    expect(compiled.previousMessages).toEqual([
      {
        role: "assistant",
        content: "old answer",
      },
      {
        role: "user",
        content: "recent request",
      },
    ]);
    expect(compiled.omittedMessages).toEqual([
      {
        index: 0,
        role: "user",
        reason: "history_budget",
      },
    ]);
  });

  it("should cap previous messages by approximate character budget", () => {
    const compiled = new InteractionContextCompiler().compile({
      message: "continue",
      previousMessages: [
        {
          role: "user",
          content: "old request with many chars",
        },
        {
          role: "assistant",
          content: "recent",
        },
      ],
      mode: "agent",
      maxPreviousChars: 10,
    });

    expect(compiled.previousMessages).toEqual([
      {
        role: "assistant",
        content: "recent",
      },
    ]);
    expect(compiled.omittedMessages).toEqual([
      {
        index: 0,
        role: "user",
        reason: "history_budget",
      },
    ]);
  });
});
