export interface ToolActivityDisplay {
  readonly action: string;
  readonly targetLabel?: string;
  readonly label: string;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const fileToolNames = new Set([
  "ReadFile",
  "FileChunks",
  "WriteFile",
  "EditFile",
  "DeleteFile",
]);

export function formatToolActivity(
  toolName: string,
  input: unknown,
): ToolActivityDisplay {
  const record = isRecord(input) ? input : {};
  const path = firstString(record, [
    "path",
    "file",
    "filePath",
    "uri",
    "targetPath",
  ]);
  const command = firstString(record, ["command", "cmd"]);
  const pattern = firstString(record, ["pattern", "query", "symbol", "name"]);
  const displayPath = path ? compactPathLabel(path) : undefined;

  switch (toolName) {
    case "ReadFile":
    case "FileChunks":
    case "GetCurrentFile":
      return buildDisplay("Read", displayPath ?? "current file");
    case "WriteFile":
    case "EditFile":
      return buildDisplay("Write", displayPath ?? "file");
    case "DeleteFile":
      return buildDisplay("Delete", displayPath ?? "file");
    case "ListDirectory":
      return buildDisplay("List", displayPath ?? "workspace");
    case "RunCommand":
      return buildDisplay("Bash", command ? truncate(command, 48) : "command");
    case "Grep":
    case "SearchFiles":
    case "FindSymbols":
    case "FindReferences":
      return buildDisplay(
        "Search",
        pattern ? quote(truncate(pattern, 42)) : "workspace",
      );
    case "GetDiagnostics":
    case "GetProblems":
    case "Problems":
      return buildDisplay("Check", displayPath ?? "diagnostics");
    case "WorkspaceGraph":
      return buildDisplay("Analyze", "workspace graph");
    case "OpenFile":
      return buildDisplay("Open", displayPath ?? "file");
    case "AskUserQuestion":
      return buildDisplay("Ask", getQuestionLabel(record));
    case "CollectWorkspaceEvidence":
      return buildDisplay("Collect", "workspace evidence");
    default:
      if (/shell|terminal/i.test(toolName)) {
        return buildDisplay(
          "Shell",
          command ? truncate(command, 48) : "command",
        );
      }

      if (fileToolNames.has(toolName)) {
        return buildDisplay(toolName, displayPath ?? "file");
      }

      return buildDisplay(toolName);
  }
}

function buildDisplay(
  action: string,
  targetLabel?: string,
): ToolActivityDisplay {
  return {
    action,
    targetLabel,
    label: targetLabel ? `${action} ${targetLabel}` : action,
  };
}

function getQuestionLabel(record: UnknownRecord): string {
  const questions = record.questions;
  if (Array.isArray(questions)) {
    const firstQuestion = questions[0];
    if (isRecord(firstQuestion)) {
      return (
        firstString(firstQuestion, ["header", "title", "question"]) ??
        "question"
      );
    }
  }

  return firstString(record, ["title", "header", "question"]) ?? "question";
}

function firstString(
  record: UnknownRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function compactPathLabel(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function quote(value: string): string {
  return `"${value}"`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
