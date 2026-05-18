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

import { existsSync, readFileSync } from "fs";
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
    this.promptsDir = path.join(__dirname, 'prompts');
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
      // === CRÍTICO: OUTPUT STYLE (FORMATAÇÃO E TONE - PRIORIDADE MÁXIMA) ===
      this.loadOutputStyle(),

      // === IDENTIDADE E PRINCÍPIOS ===
      this.loadMarkdown("base.md"),

      // === CRÍTICO: MODOS DE OPERAÇÃO (NÃO-NEGOCIÁVEL) ===
      this.getModeContext(options.mode, options.maxIterations),

      // === CRÍTICO: FERRAMENTAS E LIMITES (NÃO-NEGOCIÁVEL) ===
      this.loadMarkdown("commands.md"),
      this.loadMarkdown("limits.md"),

      // === FERRAMENTAS DINÂMICAS (Confirmação) ===
      this.getToolsContext(options.mode),

      // === CRÍTICO: PROVIDERS E MODELOS DISPONÍVEIS (NÃO-NEGOCIÁVEL) ===
      this.loadMarkdown("providers.md", {
        providerType: options.providerType,
        model: options.model,
      }),

      // === RUNTIME E EXEMPLOS ===
      this.loadMarkdown("runtime.md"),
      this.loadMarkdown("engineering.md"),
      this.loadMarkdown("examples/tool-usage.md"),
    ];

    const prompt = sections.join("\n\n");

    // Debug: verificar se Output Style está no prompt final
    const outputStyleSection = sections[1]; // Output Style é a 2ª seção
    const hasOutputStyle = outputStyleSection && outputStyleSection.includes('Response Style');

    console.log('[KORIX] System prompt final:', {
      totalLength: prompt.length,
      sections: sections.length,
      outputStyleIncluded: hasOutputStyle,
      outputStylePreview: outputStyleSection ? outputStyleSection.substring(0, 150) : 'EMPTY',
      promptPreview: prompt.substring(0, 500) + '...',
    });

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
      let content = readFileSync(filePath, "utf-8");

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

  /**
   * Carrega Output Style se configurado
   * Baseado no mecanismo oficial do Claude Code
   */
  private loadOutputStyle(): string {
    try {
      const stylePath = path.join(this.promptsDir, 'output-styles', 'professional.md');

      if (!existsSync(stylePath)) {
        console.warn('[KORIX] Output style NOT FOUND at:', stylePath);
        this.logger.warn('Output style not found, using default');
        return '';
      }

      console.log('[KORIX] Loading Output style from:', stylePath);

      const content = readFileSync(stylePath, 'utf-8');

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        this.logger.error('Invalid output style format (missing frontmatter)');
        return '';
      }

      const frontmatter = frontmatterMatch[1];
      const body = frontmatterMatch[2];

      if (!frontmatter || !body) {
        this.logger.error('Invalid output style format (empty frontmatter or body)');
        return '';
      }

      const keepCodingInstructions = frontmatter.includes('keep-coding-instructions: true');

      // Log visible for debugging
      console.log('[KORIX] Output style loaded:', {
        keepCodingInstructions,
        bodyLength: body.length,
        preview: body.substring(0, 100) + '...',
      });

      this.logger.debug('Output style loaded', {
        keepCodingInstructions,
        bodyLength: body.length,
      });

      return body.trim();
    } catch (error) {
      this.logger.error('Failed to load output style', error);
      return '';
    }
  }
}
