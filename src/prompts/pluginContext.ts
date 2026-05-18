/**
 * PluginContextBuilder - Constrói system prompt unificado para o LLM
 *
 * Responsabilidades:
 * - Agregar informações sobre o plugin (nome, versão, propósito)
 * - Incluir contexto do modo atual (Ask/Plan/Agent)
 * - Listar ferramentas disponíveis com descrições
 * - Informar modelo e provider em uso
 */

import type { Logger } from "../telemetry/logger";
import type { ToolRegistry } from "../harness/toolRegistry";
import { AgentModeHandler } from "../modes/agent/executor";
import { AskModeHandler } from "../modes/ask/handler";
import { PlanModeHandler } from "../modes/plan/decomposer";

export interface ContextBuildOptions {
  readonly mode: "ask" | "plan" | "agent";
  readonly providerType: string;
  readonly model: string;
  readonly maxIterations?: number;
}

export class PluginContextBuilder {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
  ) {}

  /**
   * Constrói system prompt unificado
   *
   * @param options Opções de contexto (modo, provider, modelo)
   * @returns System prompt completo
   */
  build(options: ContextBuildOptions): string {
    this.logger.debug("Building unified system prompt", {
      mode: options.mode,
      provider: options.providerType,
      model: options.model,
    });

    const sections = [
      this.getPluginInfo(),
      this.getModeContext(options.mode, options.maxIterations),
      this.getToolsContext(options.mode),
      this.getModelInfo(options.providerType, options.model),
    ];

    const prompt = sections.join("\n\n");

    this.logger.debug("System prompt built", {
      length: prompt.length,
      sections: sections.length,
    });

    return prompt;
  }

  /**
   * Informações básicas do plugin
   */
  private getPluginInfo(): string {
    return `# Korix Code AI Assistant

You are an AI coding assistant integrated into VS Code via the Korix Code plugin.

**Plugin**: Korix Code (v0.1.0)
**Environment**: VS Code Extension
**Architecture**: Event-driven agentic runtime with tool execution capabilities`;
  }

  /**
   * Contexto específico do modo atual
   *
   * Delega para os handlers de modo existentes
   */
  private getModeContext(
    mode: "ask" | "plan" | "agent",
    maxIterations?: number,
  ): string {
    switch (mode) {
      case "agent":
        return new AgentModeHandler({ maxIterations }).getSystemPrompt();
      case "plan":
        return new PlanModeHandler().getSystemPrompt();
      case "ask":
        return new AskModeHandler().getSystemPrompt();
    }
  }

  /**
   * Lista ferramentas disponíveis no modo atual
   */
  private getToolsContext(mode: "ask" | "plan" | "agent"): string {
    const tools = this.toolRegistry.listForMode(mode);

    if (tools.length === 0) {
      return `## Available Tools

No tools available in ${mode} mode.`;
    }

    const toolList = tools
      .map((tool) => `- **${tool.name}**: ${tool.description}`)
      .join("\n");

    return `## Available Tools (${tools.length} total)

You have access to the following tools:

${toolList}

**Important**: These are the ONLY tools available. Do not reference or claim to have tools not listed above.`;
  }

  /**
   * Informações sobre o modelo e provider em uso
   */
  private getModelInfo(providerType: string, model: string): string {
    return `## Your Identity

**Provider**: ${providerType}
**Model**: ${model}

When asked about your capabilities or identity, reference these exact values.`;
  }
}
