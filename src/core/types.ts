/**
 * Core type definitions for Korix Code extension
 */

export type Mode = "ask" | "plan" | "agent";

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  output: unknown;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
  };
}

export interface ExecutionContext {
  mode: Mode;
  workspaceRoot: string;
  currentFile?: string;
  selection?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    text: string;
  };
  openFiles: string[];
}

export interface Session {
  id: string;
  mode: Mode;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeState {
  session: Session;
  context: ExecutionContext;
  isExecuting: boolean;
  currentIteration: number;
  maxIterations: number;
  checkpoints: Checkpoint[];
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  state: Partial<RuntimeState>;
  filesModified: string[];
}

export interface Config {
  provider: "anthropic" | "openai" | "ollama" | "openrouter";
  apiKey: string;
  model: string;
  maxIterations: number;
  contextTokenBudget: number;
  approvalFlowEnabled: boolean;
  telemetryEnabled: boolean;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}
