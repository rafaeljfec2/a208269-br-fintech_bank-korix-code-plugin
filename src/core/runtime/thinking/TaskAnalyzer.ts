import type { ExecutionContext } from "../../types";
import type {
  ThinkingIntent,
  ThinkingRiskLevel,
  ThinkingRunProfile,
} from "./types";

export class TaskAnalyzer {
  private readonly commonTechnologyTerms = new Set([
    "angular",
    "aws",
    "azure",
    "docker",
    "drizzle",
    "express",
    "gcp",
    "graphql",
    "grpc",
    "javascript",
    "jwt",
    "kubernetes",
    "mongodb",
    "mysql",
    "nestjs",
    "node",
    "oauth",
    "postgres",
    "postgresql",
    "prisma",
    "react",
    "redis",
    "rest",
    "sequelize",
    "sqlite",
    "typeorm",
    "typescript",
    "vue",
  ]);

  private readonly workspaceSymbolSuffixes = [
    "Adapter",
    "Client",
    "Component",
    "Config",
    "Controller",
    "Dto",
    "DTO",
    "Engine",
    "Entity",
    "Factory",
    "Guard",
    "Handler",
    "Hook",
    "Manager",
    "Middleware",
    "Model",
    "Module",
    "Provider",
    "Repository",
    "Resolver",
    "Router",
    "Schema",
    "Service",
    "Store",
    "Tool",
    "UseCase",
    "View",
  ];

  analyze(message: string, context: ExecutionContext): ThinkingRunProfile {
    const normalized = message.toLowerCase();
    const mentionedSymbols = this.extractMentionedSymbols(message);
    const intent = this.detectIntent(normalized);
    const riskLevel = this.detectRisk(normalized, intent);
    const requiresWorkspaceEvidence = this.requiresWorkspaceEvidence(
      normalized,
      context,
      mentionedSymbols,
      intent,
    );
    const constraints = this.extractConstraints(normalized, context);

    return {
      intent,
      riskLevel,
      requiresWorkspaceEvidence,
      requiresToolUse: requiresWorkspaceEvidence || riskLevel !== "low",
      mentionedSymbols,
      constraints,
      summary: this.buildSummary(intent, riskLevel, requiresWorkspaceEvidence),
    };
  }

  private detectIntent(message: string): ThinkingIntent {
    if (/\b(implemente|implement|crie|create|altere|modify|fix|corrija|patch|refactor)\b/.test(message)) {
      return "modify";
    }

    if (/\b(plano|planeje|plan|roadmap|arquitetura|architecture)\b/.test(message)) {
      return "plan";
    }

    if (/\b(erro|bug|falha|failure|diagnose|debug|investigue|investigate)\b/.test(message)) {
      return "diagnose";
    }

    if (/\b(teste|test|valide|validate|verifique|check)\b/.test(message)) {
      return "validate";
    }

    if (/\b(explique|explain|como funciona|why|por que)\b/.test(message)) {
      return "explain";
    }

    return "answer";
  }

  private detectRisk(message: string, intent: ThinkingIntent): ThinkingRiskLevel {
    if (/\b(delete|remove|rm\s+-rf|reset --hard|push|commit|deploy|produção|production)\b/.test(message)) {
      return "high";
    }

    if (intent === "modify" || /\b(run|execute|instale|install|migrate|migration)\b/.test(message)) {
      return "medium";
    }

    return "low";
  }

  private requiresWorkspaceEvidence(
    message: string,
    context: ExecutionContext,
    mentionedSymbols: readonly string[],
    intent: ThinkingIntent,
  ): boolean {
    if (context.currentFile || context.openFiles.length > 0) {
      if (/\b(este|esse|essa|arquivo|file|repo|workspace|projeto|código|codigo|code)\b/.test(message)) {
        return true;
      }
    }

    if (mentionedSymbols.length > 0) {
      return true;
    }

    if (/\b(src\/|\.ts|\.tsx|\.js|\.jsx|classe|class|função|funcao|function|componente|component)\b/.test(message)) {
      return true;
    }

    return intent === "modify" || intent === "diagnose" || intent === "validate";
  }

  private extractMentionedSymbols(message: string): readonly string[] {
    const symbols = new Set<string>();
    const codeMatches = message.matchAll(/`([^`]+)`/g);

    for (const match of codeMatches) {
      const raw = match[1]?.trim();
      if (raw && /^[A-Za-z_$][\w$.-]*$/.test(raw)) {
        symbols.add(raw);
      }
    }

    const identifierMatches = message.matchAll(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g);
    for (const match of identifierMatches) {
      const value = match[0];
      if (this.isLikelyWorkspaceSymbol(value)) {
        symbols.add(value);
      }
    }

    return [...symbols].slice(0, 12);
  }

  private isLikelyWorkspaceSymbol(value: string): boolean {
    if (value.length <= 2) {
      return false;
    }

    if (this.commonTechnologyTerms.has(value.toLowerCase())) {
      return false;
    }

    if (value.includes(".")) {
      return true;
    }

    if (/^[A-Z][A-Z0-9_]+$/.test(value) && value.includes("_")) {
      return true;
    }

    if (/^[a-z_$][\w$]*[A-Z][\w$]*$/.test(value)) {
      return true;
    }

    return this.workspaceSymbolSuffixes.some((suffix) => value.endsWith(suffix));
  }

  private extractConstraints(
    message: string,
    context: ExecutionContext,
  ): readonly string[] {
    const constraints: string[] = [];

    if (context.mode === "ask" || context.mode === "plan") {
      constraints.push("read_only_mode");
    }

    if (/\b(sem alterar|não altere|nao altere|no changes|read-only)\b/.test(message)) {
      constraints.push("no_file_changes");
    }

    if (/\b(rápido|rapido|quick|minimal|mínimo|minimo)\b/.test(message)) {
      constraints.push("minimal_response");
    }

    return constraints;
  }

  private buildSummary(
    intent: ThinkingIntent,
    riskLevel: ThinkingRiskLevel,
    requiresWorkspaceEvidence: boolean,
  ): string {
    const evidence = requiresWorkspaceEvidence
      ? "workspace evidence required"
      : "general response path";

    return `${intent} task, ${riskLevel} risk, ${evidence}`;
  }
}
