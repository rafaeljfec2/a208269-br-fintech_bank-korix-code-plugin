/**
 * Tool registry for managing and executing tools with validation
 */

import { z } from "zod";
import type { ExecutionContext } from "../core/types";
import type { TodoItem } from "../core/runtime/runtimeTypes";
import type {
  SubagentRequest,
  SubagentResult,
} from "../core/subagent/subagentTypes";
import type { ToolDefinition } from "../providers/types";
import { ToolCache } from "../tools/registry/ToolCache";
import { ToolMetrics } from "../tools/registry/ToolMetrics";
import { ToolScheduler } from "../tools/registry/ToolScheduler";

export interface ToolContext {
  execution: ExecutionContext;
  workspaceRoot: string;
  readonly signal?: AbortSignal;
  userId?: string;
  runSubagent?: (request: SubagentRequest) => Promise<SubagentResult>;
  updateTodos?: (todos: readonly TodoItem[]) => readonly TodoItem[];
  getTodos?: () => readonly TodoItem[];
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
    timestamp: number;
    cached?: boolean;
    cacheHitRate?: number;
  };
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;

  /**
   * Marks tool as interactive (blocks execution waiting for user input).
   * Interactive tools don't trigger loop continuation.
   */
  readonly isInteractive?: boolean;

  /**
   * Execute the tool with validated input
   */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;

  /**
   * Determine if this tool requires user approval
   */
  requiresApproval?(input: TInput, context: ToolContext): boolean;

  /**
   * Check if tool is allowed in current mode
   */
  allowedInMode?(mode: ExecutionContext["mode"]): boolean;
}

const READ_ONLY_TOOL_NAMES = new Set([
  "ReadFile",
  "ListDirectory",
  "FileChunks",
  "SearchFiles",
  "Grep",
  "FindReferences",
  "FindSymbols",
  "GitStatus",
  "GitDiff",
  "ChangedFiles",
  "Problems",
  "GetDiagnostics",
  "WorkspaceGraph",
  "GetOpenFiles",
  "GetCurrentFile",
]);

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private readonly cache: ToolCache;
  private readonly metrics: ToolMetrics;
  private readonly scheduler: ToolScheduler;

  constructor() {
    // Initialize cache with 100MB limit, 5min TTL, max 1000 entries
    this.cache = new ToolCache({
      maxSize: 100 * 1024 * 1024, // 100MB
      maxAge: 5 * 60 * 1000, // 5 minutes
      maxEntries: 1000,
      enableHotCold: true,
    });

    this.metrics = new ToolMetrics(10000);
    this.scheduler = new ToolScheduler();
  }

  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listForMode(mode: ExecutionContext["mode"]): Tool[] {
    if (mode === "ask") {
      return [];
    }

    return this.list().filter((tool) => {
      return this.isToolAllowedInMode(tool, mode);
    });
  }

  async execute<TOutput = unknown>(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    let cached = false;

    try {
      const tool = this.tools.get(name);

      if (!tool) {
        const error = `Tool not found: ${name}`;
        this.recordMetric(name, startTime, false, cached, input, null, error);
        return {
          success: false,
          error,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
            cached,
          },
        };
      }

      // Check if tool is allowed in current mode
      if (!this.isToolAllowedInMode(tool, context.execution.mode)) {
        const error = `Tool "${name}" not allowed in ${context.execution.mode} mode`;
        this.recordMetric(name, startTime, false, cached, input, null, error);
        return {
          success: false,
          error,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
            cached,
          },
        };
      }

      // Validate input schema
      const validationResult = tool.schema.safeParse(input);

      if (!validationResult.success) {
        const error = `Invalid input: ${validationResult.error.message}`;
        this.recordMetric(name, startTime, false, cached, input, null, error);
        return {
          success: false,
          error,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
            cached,
          },
        };
      }

      // Check cache (only for read-only tools)
      const cachedResult = this.cache.get<TOutput>(name, validationResult.data);
      if (cachedResult) {
        cached = true;
        this.recordMetric(
          name,
          startTime,
          true,
          cached,
          input,
          cachedResult.data,
        );
        return {
          ...cachedResult,
          metadata: {
            duration: Date.now() - startTime,
            approved: cachedResult.metadata?.approved ?? false,
            timestamp: cachedResult.metadata?.timestamp ?? startTime,
            cached: true,
            cacheHitRate: this.cache.getStats().hitRate,
          },
        };
      }

      // Execute tool
      const result = await tool.execute(validationResult.data, context);

      const finalResult: ToolResult<TOutput> = {
        success: result.success,
        data: result.data as TOutput | undefined,
        error: result.error,
        metadata: {
          duration: Date.now() - startTime,
          approved: result.metadata?.approved ?? false,
          timestamp: startTime,
          cached,
          cacheHitRate: this.cache.getStats().hitRate,
        },
      };

      // Cache successful read-only results
      if (result.success && !this.isWriteTool(name)) {
        this.cache.set(name, validationResult.data, finalResult);
      }

      this.recordMetric(
        name,
        startTime,
        result.success,
        cached,
        input,
        result.data,
        result.error,
      );

      return finalResult;
    } catch (error) {
      const err = error as Error;
      this.recordMetric(
        name,
        startTime,
        false,
        cached,
        input,
        null,
        err.message,
      );
      return {
        success: false,
        error: err.message,
        metadata: {
          duration: Date.now() - startTime,
          approved: false,
          timestamp: startTime,
          cached,
        },
      };
    }
  }

  /**
   * Convert tools to provider tool definitions
   */
  toProviderDefinitions(
    mode?: ExecutionContext["mode"],
    allowedTools: readonly string[] = [],
  ): ToolDefinition[] {
    const allowedToolSet =
      allowedTools.length > 0 ? new Set(allowedTools) : undefined;
    const tools = (mode ? this.listForMode(mode) : this.list()).filter(
      (tool) => (allowedToolSet ? allowedToolSet.has(tool.name) : true),
    );

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.schema),
    }));
  }

  private isToolAllowedInMode(
    tool: Tool,
    mode: ExecutionContext["mode"],
  ): boolean {
    if (mode === "ask") {
      return false;
    }

    if (mode === "plan" && !READ_ONLY_TOOL_NAMES.has(tool.name)) {
      return false;
    }

    return tool.allowedInMode?.(mode) ?? true;
  }

  private zodToJsonSchema(schema: z.ZodSchema): {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  } {
    // Simplified Zod to JSON Schema conversion
    // For production, use a library like zod-to-json-schema
    interface ZodDef {
      typeName?: string;
    }
    const schemaDef = schema._def as ZodDef;
    const schemaType = schemaDef.typeName;

    if (schemaType === "ZodObject") {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value;
        properties[key] = this.convertZodType(fieldSchema);

        if (!fieldSchema.isOptional()) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    return {
      type: "object",
      properties: {},
    };
  }

  private convertZodType(schema: z.ZodTypeAny): unknown {
    interface ZodDef {
      typeName?: string;
    }
    const typeName = (schema._def as ZodDef).typeName;

    switch (typeName) {
      case "ZodString":
        return { type: "string" };
      case "ZodNumber":
        return { type: "number" };
      case "ZodBoolean":
        return { type: "boolean" };
      case "ZodArray":
        return {
          type: "array",
          items: this.convertZodType(
            (schema as z.ZodArray<z.ZodTypeAny>).element,
          ),
        };
      case "ZodObject":
        // Recursively convert nested objects
        return this.zodToJsonSchema(schema as z.ZodObject<z.ZodRawShape>);
      case "ZodOptional":
        return this.convertZodType(
          (schema as z.ZodOptional<z.ZodTypeAny>).unwrap(),
        );
      default:
        // Fallback: try to convert as object if possible
        if ("shape" in schema) {
          return this.zodToJsonSchema(schema as z.ZodObject<z.ZodRawShape>);
        }
        return { type: "string" };
    }
  }

  /**
   * Check if tool is a write tool (should not be cached)
   */
  private isWriteTool(name: string): boolean {
    const writeTools = [
      "WriteFile",
      "EditFile",
      "RunCommand",
      "Await",
      "DeleteFile",
      "OpenFile",
      "Task",
      "TodoWrite",
    ];
    return writeTools.includes(name);
  }

  /**
   * Record metric for tool execution
   */
  private recordMetric(
    tool: string,
    startTime: number,
    success: boolean,
    cached: boolean,
    input: unknown,
    output: unknown,
    error?: string,
  ): void {
    const duration = Date.now() - startTime;
    const inputSize = Buffer.byteLength(JSON.stringify(input), "utf-8");
    const outputSize = output
      ? Buffer.byteLength(JSON.stringify(output), "utf-8")
      : 0;

    this.metrics.record({
      tool,
      timestamp: startTime,
      duration,
      cached,
      success,
      inputSize,
      outputSize,
      error,
    });
  }

  /**
   * Get cache instance
   */
  getCache(): ToolCache {
    return this.cache;
  }

  /**
   * Get metrics instance
   */
  getMetrics(): ToolMetrics {
    return this.metrics;
  }

  /**
   * Get scheduler instance
   */
  getScheduler(): ToolScheduler {
    return this.scheduler;
  }

  /**
   * Invalidate cache for specific pattern
   */
  invalidateCache(pattern: string | RegExp): void {
    this.cache.invalidate(pattern);
  }
}

export const globalToolRegistry = new ToolRegistry();
