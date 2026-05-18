/**
 * PluginContextBuilder - Constrói system prompt unificado para o LLM
 *
 * Abordagem Híbrida:
 * - Contexto estático: arquivos .md em src/prompts/
 * - Contexto dinâmico: ferramentas do ToolRegistry, modelo/provider da config
 *
 * Responsabilidades:
 * - Carregar contexto base e de modo de arquivos .md
 * - Listar ferramentas disponíveis dinamicamente
 * - Informar modelo e provider em uso
 * - Interpolar variáveis nos templates
 */

import * as fs from "fs";
import * as path from "path";
import type { Logger } from "../telemetry/logger";
import type { ToolRegistry } from "../harness/toolRegistry";

export interface ContextBuildOptions {
  readonly mode: "ask" | "plan" | "agent";
  readonly providerType: string;
  readonly model: string;
  readonly maxIterations?: number;
}

export class PluginContextBuilder {
  private readonly promptsDir: string;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger,
  ) {
    // Resolve prompts directory relative to this file
    this.promptsDir = path.join(__dirname);
  }

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
      this.loadMarkdown("base.md"),
      this.loadMarkdown("guidelines.md"),
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
   * Carrega e interpola um arquivo markdown
   */
  private loadMarkdown(filename: string, variables?: Record<string, string>): string {
    try {
      const filePath = path.join(this.promptsDir, filename);
      let content = fs.readFileSync(filePath, "utf-8");

      // Interpolar variáveis se fornecidas
      if (variables) {
        content = this.interpolate(content, variables);
      }

      return content.trim();
    } catch (error) {
      this.logger.error(`Failed to load markdown file: ${filename}`, error);
      return `<!-- Error loading ${filename} -->`;
    }
  }

  /**
   * Interpola variáveis em um template
   * Substitui {variableName} pelos valores fornecidos
   */
  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = variables[key];
      return value ?? match;
    });
  }

  /**
   * Contexto específico do modo atual
   *
   * Carrega do arquivo .md correspondente e interpola variáveis
   */
  private getModeContext(
    mode: "ask" | "plan" | "agent",
    maxIterations?: number,
  ): string {
    const variables: Record<string, string> = {
      maxIterations: String(maxIterations ?? 25),
    };

    return this.loadMarkdown(`modes/${mode}.md`, variables);
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
