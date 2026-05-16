/**
 * Tool registry for managing and executing tools with validation
 */

import { z } from "zod";
import type { ExecutionContext } from "../core/types";
import type { ToolDefinition } from "../providers/types";

export interface ToolContext {
  execution: ExecutionContext;
  workspaceRoot: string;
  userId?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration: number;
    approved: boolean;
    timestamp: number;
  };
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;

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

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

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
    return this.list().filter((tool) => {
      if (!tool.allowedInMode) {
        return true;
      }
      return tool.allowedInMode(mode);
    });
  }

  async execute<TOutput = unknown>(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();

    try {
      const tool = this.tools.get(name);

      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${name}`,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
          },
        };
      }

      // Check if tool is allowed in current mode
      if (tool.allowedInMode && !tool.allowedInMode(context.execution.mode)) {
        return {
          success: false,
          error: `Tool "${name}" not allowed in ${context.execution.mode} mode`,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
          },
        };
      }

      // Validate input schema
      const validationResult = tool.schema.safeParse(input);

      if (!validationResult.success) {
        return {
          success: false,
          error: `Invalid input: ${validationResult.error.message}`,
          metadata: {
            duration: Date.now() - startTime,
            approved: false,
            timestamp: startTime,
          },
        };
      }

      // Execute tool
      const result = await tool.execute(validationResult.data, context);

      return {
        success: result.success,
        data: result.data as TOutput | undefined,
        error: result.error,
        metadata: {
          duration: Date.now() - startTime,
          approved: result.metadata?.approved ?? false,
          timestamp: startTime,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        metadata: {
          duration: Date.now() - startTime,
          approved: false,
          timestamp: startTime,
        },
      };
    }
  }

  /**
   * Convert tools to provider tool definitions
   */
  toProviderDefinitions(mode?: ExecutionContext["mode"]): ToolDefinition[] {
    const tools = mode ? this.listForMode(mode) : this.list();

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.schema),
    }));
  }

  private zodToJsonSchema(schema: z.ZodSchema): {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  } {
    // Simplified Zod to JSON Schema conversion
    // For production, use a library like zod-to-json-schema
    const schemaDef = schema._def as { typeName?: string };
    const schemaType = schemaDef.typeName;

    if (schemaType === "ZodObject") {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
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
    const typeName = schema._def.typeName;

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
      case "ZodOptional":
        return this.convertZodType(
          (schema as z.ZodOptional<z.ZodTypeAny>).unwrap(),
        );
      default:
        return { type: "string" };
    }
  }
}

export const globalToolRegistry = new ToolRegistry();
