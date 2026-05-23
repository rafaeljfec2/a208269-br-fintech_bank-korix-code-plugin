import type { ObservationSummary } from "./types";

export class ObservationEngine {
  private readonly maxSummaryChars = 900;

  summarizeToolResult(
    toolName: string,
    result: unknown,
    success: boolean,
  ): ObservationSummary {
    const rawText = this.stringify(result);
    const importantLines = this.extractImportantLines(rawText);
    const sourceName = toolName;
    const retryHint = success ? undefined : this.inferRetryHint(rawText);
    const summary = this.buildSummary(
      sourceName,
      rawText,
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
