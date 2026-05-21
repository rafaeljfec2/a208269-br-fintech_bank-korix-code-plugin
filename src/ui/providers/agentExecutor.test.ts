import { describe, expect, it } from "vitest";
import {
  resolveModeSensitiveUserMessage,
  sanitizeModeSensitiveHistory,
} from "./agentExecutor";

describe("sanitizeModeSensitiveHistory", () => {
  it("should remove stale ask-mode assistant claims after switching to agent", () => {
    const history = sanitizeModeSensitiveHistory(
      [
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
          role: "user",
          content: "tente agora",
        },
      ],
      "agent",
    );

    expect(history).toEqual([
      {
        role: "user",
        content: "olhe tres arquivos do projeto",
      },
      {
        role: "user",
        content: "tente agora",
      },
    ]);
  });

  it("should preserve history while still in ask mode", () => {
    const previousMessages = [
      {
        role: "assistant" as const,
        content: "Estou em modo ASK.",
      },
    ];

    expect(sanitizeModeSensitiveHistory(previousMessages, "ask")).toBe(
      previousMessages,
    );
  });

  it("should remove direct-response workspace denial variants after switching to agent", () => {
    const history = sanitizeModeSensitiveHistory(
      [
        {
          role: "assistant",
          content:
            "Não tenho acesso ao workspace neste modo de resposta direta, então não consigo listar nem ler arquivos.",
        },
        {
          role: "assistant",
          content:
            "Continuo sem acesso às ferramentas de leitura de arquivos nesta resposta.",
        },
      ],
      "agent",
    );

    expect(history).toEqual([]);
  });

  it("should restore the previous actionable request when retrying after an ask-mode denial", () => {
    const effectiveMessage = resolveModeSensitiveUserMessage(
      "tente novamente",
      [
        {
          role: "user",
          content: "Leia tres arquivos do projeto e passe um resumo deles",
        },
        {
          role: "assistant",
          content:
            "Não consigo atender esse pedido no modo atual. Mode: ASK — sem acesso a ferramentas.",
        },
      ],
      "agent",
    );

    expect(effectiveMessage).toContain(
      "Leia tres arquivos do projeto e passe um resumo deles",
    );
    expect(effectiveMessage).toContain("tente novamente");
  });
});
