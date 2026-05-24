import type { ContextSymbol, WorkspaceFileInput } from "./types";

interface LightweightSymbol {
  readonly name: string;
  readonly kind: string;
  readonly startLine: number;
  readonly endLine: number;
}

const PYTHON_SYMBOL_PATTERN = /^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)\b/;
const JAVA_TYPE_PATTERN = /\b(class|interface)\s+([A-Za-z_$][\w$]*)\b/;
const JAVA_CONSTRUCTOR_PATTERN =
  /\b(?:public|private|protected)?\s*([A-Za-z_$][\w$]*)\s*\([^;]*\)/;
const JAVA_METHOD_PATTERN =
  /\b(?:public|private|protected|static|final|synchronized|native|abstract)\b[\w\s<>\[\],.?]*\s+([A-Za-z_$][\w$]*)\s*\([^;]*\)/;
const JAVA_CONTROL_WORDS = new Set(["if", "for", "while", "switch", "catch"]);
const RUST_TYPE_PATTERN =
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait)\s+([A-Za-z_]\w*)\b/;
const RUST_IMPL_PATTERN =
  /^\s*impl(?:<[^>]+>)?\s+(?:[A-Za-z_][\w:<>]*\s+for\s+)?([A-Za-z_][\w:]*)\b/;
const RUST_FUNCTION_PATTERN =
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\b/;

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function blockEndLine(
  lines: readonly string[],
  startIndex: number,
  startIndentation: number,
): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) {
      continue;
    }

    if (indentation(line) <= startIndentation) {
      return index;
    }
  }

  return lines.length;
}

function bracedBlockEndLine(
  lines: readonly string[],
  startIndex: number,
): number {
  let depth = 0;
  let sawOpeningBrace = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const character of line) {
      if (character === "{") {
        depth += 1;
        sawOpeningBrace = true;
      } else if (character === "}") {
        depth -= 1;
      } else if (character === ";" && !sawOpeningBrace) {
        return index + 1;
      }
    }

    if (sawOpeningBrace && depth <= 0) {
      return index + 1;
    }
  }

  return startIndex + 1;
}

function extractPythonSymbols(
  file: WorkspaceFileInput,
): readonly LightweightSymbol[] {
  const lines = file.content.split(/\r?\n/);
  const symbols: LightweightSymbol[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trimStart();
    const match = PYTHON_SYMBOL_PATTERN.exec(trimmed);
    if (match === null) {
      return;
    }

    symbols.push({
      name: match[2] ?? "",
      kind: match[1] === "class" ? "class" : "function",
      startLine: index + 1,
      endLine: blockEndLine(lines, index, indentation(line)),
    });
  });

  return symbols.filter((symbol) => symbol.name.length > 0);
}

function extractJavaSymbols(
  file: WorkspaceFileInput,
): readonly LightweightSymbol[] {
  const lines = file.content.split(/\r?\n/);
  const symbols: LightweightSymbol[] = [];
  const typeNames = new Set<string>();

  lines.forEach((line, index) => {
    const typeMatch = JAVA_TYPE_PATTERN.exec(line);
    if (typeMatch !== null) {
      const name = typeMatch[2] ?? "";
      if (name.length > 0) {
        typeNames.add(name);
      }

      symbols.push({
        name,
        kind: typeMatch[1] === "interface" ? "interface" : "class",
        startLine: index + 1,
        endLine: lines.length,
      });
      return;
    }

    const constructorMatch = JAVA_CONSTRUCTOR_PATTERN.exec(line);
    const constructorName = constructorMatch?.[1];
    if (constructorName !== undefined && typeNames.has(constructorName)) {
      symbols.push({
        name: constructorName,
        kind: "constructor",
        startLine: index + 1,
        endLine: index + 1,
      });
      return;
    }

    const methodMatch = JAVA_METHOD_PATTERN.exec(line);
    const name = methodMatch?.[1];
    if (name === undefined || JAVA_CONTROL_WORDS.has(name)) {
      return;
    }

    symbols.push({
      name,
      kind: "method",
      startLine: index + 1,
      endLine: index + 1,
    });
  });

  return symbols.filter((symbol) => symbol.name.length > 0);
}

function extractRustSymbols(
  file: WorkspaceFileInput,
): readonly LightweightSymbol[] {
  const lines = file.content.split(/\r?\n/);
  const symbols: LightweightSymbol[] = [];

  lines.forEach((line, index) => {
    const typeMatch = RUST_TYPE_PATTERN.exec(line);
    if (typeMatch !== null) {
      symbols.push({
        name: typeMatch[2] ?? "",
        kind: typeMatch[1] ?? "",
        startLine: index + 1,
        endLine: bracedBlockEndLine(lines, index),
      });
      return;
    }

    const implMatch = RUST_IMPL_PATTERN.exec(line);
    if (implMatch !== null) {
      symbols.push({
        name: implMatch[1] ?? "",
        kind: "impl",
        startLine: index + 1,
        endLine: bracedBlockEndLine(lines, index),
      });
      return;
    }

    const functionMatch = RUST_FUNCTION_PATTERN.exec(line);
    if (functionMatch === null) {
      return;
    }

    symbols.push({
      name: functionMatch[1] ?? "",
      kind: "function",
      startLine: index + 1,
      endLine: bracedBlockEndLine(lines, index),
    });
  });

  return symbols.filter((symbol) => symbol.name.length > 0);
}

function normalizedLanguage(file: WorkspaceFileInput): string {
  const language = file.language?.toLowerCase();
  if (language !== undefined) {
    return language;
  }

  if (file.path.endsWith(".py")) {
    return "python";
  }

  if (file.path.endsWith(".java")) {
    return "java";
  }

  if (file.path.endsWith(".rs")) {
    return "rust";
  }

  return "";
}

function symbolContent(
  file: WorkspaceFileInput,
  symbol: LightweightSymbol,
): string {
  return file.content
    .split(/\r?\n/)
    .slice(symbol.startLine - 1, symbol.endLine)
    .join("\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function extractLightweightLanguageSymbols(
  file: WorkspaceFileInput,
): readonly ContextSymbol[] {
  const language = normalizedLanguage(file);
  const symbols =
    language === "python"
      ? extractPythonSymbols(file)
      : language === "java"
        ? extractJavaSymbols(file)
        : language === "rust"
          ? extractRustSymbols(file)
          : [];

  return symbols.map((symbol) => {
    const content = symbolContent(file, symbol);

    return {
      id: `${file.path}:${symbol.kind}:${symbol.name}:${symbol.startLine}`,
      name: symbol.name,
      kind: symbol.kind,
      file: file.path,
      range: {
        startLine: symbol.startLine,
        endLine: symbol.endLine,
      },
      score: 0.5,
      scoreFactors: [
        {
          name: "symbol_match",
          value: 0.5,
          weight: 0.2,
          contribution: 0.1,
        },
      ],
      reasons: [{ code: "lightweight_language_symbol", detail: language }],
      contentMode: "source",
      content,
      dependencies: [],
      estimatedTokens: estimateTokens(content),
    };
  });
}
