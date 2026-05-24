import { optimizeToolOutput } from "@korix/context-compiler";
import type { ObservationSummary } from "./types";

export class ObservationEngine {
  private readonly maxSummaryChars = 900;

  summarizeToolResult(
    toolName: string,
    result: unknown,
    success: boolean,
  ): ObservationSummary {
    const rawText = this.toObservationText(toolName, result);
    const optimization = this.optimizeObservationText(toolName, rawText);
    const observationText = optimization?.optimizedOutput ?? rawText;
    const importantLines = this.extractImportantLines(observationText);
    const sourceName = toolName;
    const retryHint = success ? undefined : this.inferRetryHint(observationText);
    const summary = this.buildSummary(
      sourceName,
      observationText,
      importantLines,
      success,
    );

    return {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      sourceType: this.inferSourceType(toolName),
      sourceName,
      success,
      summary,
      importantLines,
      rawSize: rawText.length,
      ...(optimization
        ? {
            optimizedOutput: optimization.optimizedOutput,
            optimizedSize: optimization.optimizedCharacters,
            omittedCharacters: optimization.omittedCharacters,
            optimizationReasons: optimization.reasons.map(
              (reason) => reason.code,
            ),
          }
        : {}),
      truncated: rawText.length > this.maxSummaryChars,
      retryHint,
      timestamp: Date.now(),
    };
  }

  toToolMessageContent(summary: ObservationSummary, original: unknown): string {
    if (!summary.truncated && summary.rawSize <= this.maxSummaryChars) {
      return this.stringify(original);
    }

    return JSON.stringify({
      summary: summary.summary,
      importantLines: summary.importantLines,
      ...(summary.optimizedOutput
        ? {
            optimizedOutput: summary.optimizedOutput,
            optimizedSize: summary.optimizedSize,
            omittedCharacters: summary.omittedCharacters,
            optimizationReasons: summary.optimizationReasons,
          }
        : {}),
      retryHint: summary.retryHint,
      rawSize: summary.rawSize,
      truncated: true,
    });
  }

  private stringify(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private toObservationText(toolName: string, result: unknown): string {
    if (this.inferSourceType(toolName) !== "terminal") {
      return this.stringify(result);
    }

    return this.extractTerminalText(result) ?? this.stringify(result);
  }

  private extractTerminalText(result: unknown): string | undefined {
    if (typeof result === "string") {
      return result;
    }

    if (!this.isRecord(result)) {
      return undefined;
    }

    const terminalRecord = this.isRecord(result.data) ? result.data : result;
    const parts: string[] = [];
    const error = this.readStringField(result, "error");
    const stdout = this.readStringField(terminalRecord, "stdout");
    const stderr = this.readStringField(terminalRecord, "stderr");
    const exitCode = this.readPrimitiveField(terminalRecord, "exitCode");
    const timedOut = this.readPrimitiveField(terminalRecord, "timedOut");

    if (stderr !== undefined && stderr.trim().length > 0) {
      parts.push(`stderr: ${stderr}`);
    }

    if (stdout !== undefined && stdout.trim().length > 0) {
      parts.push(`stdout:\n${stdout}`);
    }

    if (error !== undefined && error.trim().length > 0) {
      parts.push(`error: ${error}`);
    }

    if (exitCode !== undefined) {
      parts.push(`exitCode: ${String(exitCode)}`);
    }

    if (timedOut !== undefined) {
      parts.push(`timedOut: ${String(timedOut)}`);
    }

    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private readStringField(
    value: Readonly<Record<string, unknown>>,
    field: string,
  ): string | undefined {
    const fieldValue = value[field];
    return typeof fieldValue === "string" ? fieldValue : undefined;
  }

  private readPrimitiveField(
    value: Readonly<Record<string, unknown>>,
    field: string,
  ): string | number | boolean | undefined {
    const fieldValue = value[field];
    if (
      typeof fieldValue === "string" ||
      typeof fieldValue === "number" ||
      typeof fieldValue === "boolean"
    ) {
      return fieldValue;
    }

    return undefined;
  }

  private optimizeObservationText(
    toolName: string,
    rawText: string,
  ): ReturnType<typeof optimizeToolOutput> | undefined {
    if (this.inferSourceType(toolName) !== "terminal") {
      return undefined;
    }

    if (rawText.length <= this.maxSummaryChars) {
      return undefined;
    }

    return optimizeToolOutput({
      output: rawText,
      maxCharacters: this.maxSummaryChars,
    });
  }

  private extractImportantLines(text: string): readonly string[] {
    const patterns = [
      /error/i,
      /failed/i,
      /failure/i,
      /fatal/i,
      /exception/i,
      /expected/i,
      /received/i,
      /warning/i,
      /diagnostic/i,
      /not found/i,
      /cannot/i,
      /syntax/i,
    ];

    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => patterns.some((pattern) => pattern.test(line)))
      .slice(0, 8);
  }

  private buildSummary(
    sourceName: string,
    rawText: string,
    importantLines: readonly string[],
    success: boolean,
  ): string {
    if (importantLines.length > 0) {
      return `${sourceName} ${success ? "completed" : "failed"}: ${importantLines[0]}`;
    }

    const compact = rawText.replace(/\s+/g, " ").trim().slice(0, 180);
    if (compact.length > 0) {
      return `${sourceName} ${success ? "completed" : "failed"}: ${compact}`;
    }

    return `${sourceName} ${success ? "completed successfully" : "failed without details"}`;
  }

  private inferRetryHint(text: string): string | undefined {
    if (/timeout|timed out/i.test(text)) {
      return "Retry once with a shorter or more targeted command.";
    }

    if (/permission|denied|unauthorized/i.test(text)) {
      return "Escalate to user approval or adjust permissions before retrying.";
    }

    if (/not found|enoent/i.test(text)) {
      return "Re-check the path or search for the symbol before retrying.";
    }

    return "Change strategy before retrying; do not repeat the same action blindly.";
  }

  private inferSourceType(toolName: string): ObservationSummary["sourceType"] {
    if (toolName === "AskUserQuestion") {
      return "runtime";
    }

    if (toolName === "RunCommand") {
      return "terminal";
    }

    if (/diagnostic|problem/i.test(toolName)) {
      return "diagnostic";
    }

    if (/edit|write|patch/i.test(toolName)) {
      return "patch";
    }

    return "tool";
  }
}
