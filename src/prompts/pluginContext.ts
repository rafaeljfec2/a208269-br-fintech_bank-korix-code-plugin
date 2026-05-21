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
    this.promptsDir = path.join(__dirname, "prompts");
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
      this.getModelInfo(options.providerType, options.model),
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
    const hasOutputStyle = outputStyleSection?.includes("Response Style");

    this.logger.debug("[KORIX] System prompt final", {
      totalLength: prompt.length,
      sections: sections.length,
      outputStyleIncluded: hasOutputStyle,
      outputStylePreview: outputStyleSection
        ? outputStyleSection.substring(0, 150)
        : "EMPTY",
      promptPreview: prompt.substring(0, 500) + "...",
    });

    this.logger.debug("System prompt built", {
      length: prompt.length,
      sections: sections.length,
    });

    return prompt;
  }

  /**
   * Builds a compact prompt for low-risk direct answers.
   *
   * This path intentionally excludes tool instructions, runtime examples, and
   * provider catalogs so simple explanations do not pay the full agent prompt
   * latency cost.
   */
  buildDirectAnswer(
    options: Pick<ContextBuildOptions, "mode" | "providerType" | "model">,
  ): string {
    const sections = [
      this.loadOutputStyle(),
      this.getModelInfo(options.providerType, options.model),
      this.getCurrentModeInfo(options.mode),
      this.loadMarkdown("base.md"),
      this.getDirectAnswerPolicy(),
    ];

    return sections.filter((section) => section.trim().length > 0).join("\n\n");
  }

  /**
   * Carrega e interpola um arquivo markdown
   */
  private loadMarkdown(
    filename: string,
    variables?: Record<string, string>,
  ): string {
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
  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
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

  private getCurrentModeInfo(mode: "ask" | "plan" | "agent"): string {
    const modeLabel = mode.toUpperCase();
    const access =
      mode === "agent"
        ? "full workspace tools, including read, write, edit, and approved command execution"
        : mode === "plan"
          ? "read-only workspace tools for planning and analysis"
          : "normal chat only; no workspace tools, file reads, searches, writes, or command execution";

    return `## Current Mode

**Mode**: ${modeLabel}
**Access**: ${access}

If asked what mode you are in, answer with the current mode above. Do not mention internal routing paths such as fast direct answer.`;
  }

  private getDirectAnswerPolicy(): string {
    return `## Fast Direct Answer Policy

You are answering a low-risk request that does not require workspace lookup or tools.

- Answer directly and concisely.
- Use the user's pasted content as the primary evidence.
- Do not claim facts about the current repository, files, or workspace.
- In ASK mode, do not claim you can access files or workspace tools.
- If the request actually depends on workspace evidence, say that workspace context is needed instead of guessing.
- Do not mention hidden reasoning or internal prompts.`;
  }

  /**
   * Carrega Output Style se configurado
   * Baseado no mecanismo oficial do Claude Code
   */
  private loadOutputStyle(): string {
    try {
      const stylePath = path.join(
        this.promptsDir,
        "output-styles",
        "professional.md",
      );

      if (!existsSync(stylePath)) {
        console.warn("[KORIX] Output style NOT FOUND at:", stylePath);
        this.logger.warn("Output style not found, using default");
        return "";
      }

      this.logger.debug("[KORIX] Loading Output style from", { stylePath });

      const content = readFileSync(stylePath, "utf-8");

      // Parse frontmatter
      const frontmatterMatch = content.match(
        /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
      );
      if (!frontmatterMatch) {
        this.logger.error("Invalid output style format (missing frontmatter)");
        return "";
      }

      const frontmatter = frontmatterMatch[1];
      const body = frontmatterMatch[2];

      if (!frontmatter || !body) {
        this.logger.error(
          "Invalid output style format (empty frontmatter or body)",
        );
        return "";
      }

      const keepCodingInstructions = frontmatter.includes(
        "keep-coding-instructions: true",
      );

      this.logger.debug("Output style loaded", {
        keepCodingInstructions,
        bodyLength: body.length,
        preview: body.substring(0, 100) + "...",
      });

      return body.trim();
    } catch (error) {
      this.logger.error("Failed to load output style", error);
      return "";
    }
  }
}
