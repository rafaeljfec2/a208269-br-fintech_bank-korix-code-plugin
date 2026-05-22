import type { AgentLoop } from "../runtime/agentLoop";
import type { ToolRegistry } from "../../harness/toolRegistry";
import {
  SUBAGENT_CONFIGS,
  buildSubagentPrompt,
  type SubagentRequest,
  type SubagentResult,
  type SubagentConfig,
  type SubagentType,
} from "./subagentTypes";
import type { ToolCallRecord } from "../runtime/runtimeTypes";

export interface SubagentRunnerOptions {
  readonly parentRegistry: ToolRegistry;
  readonly createAgentLoop: (
    registry: ToolRegistry,
    systemPrompt: string,
  ) => AgentLoop;
  readonly createRegistry: () => ToolRegistry;
}

export interface SubagentRunnerMetrics {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly totalDuration: number;
  readonly totalIterations: number;
  readonly runsByType: Readonly<Record<SubagentType, number>>;
  readonly toolUsage: Readonly<Record<string, number>>;
}

interface MutableSubagentRunnerMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalDuration: number;
  totalIterations: number;
  runsByType: Record<SubagentType, number>;
  toolUsage: Record<string, number>;
}

export class SubagentRunner {
  private readonly metrics: MutableSubagentRunnerMetrics = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalDuration: 0,
    totalIterations: 0,
    runsByType: {
      explore: 0,
      plan: 0,
      review: 0,
      shell: 0,
      test: 0,
    },
    toolUsage: {},
  };

  constructor(private readonly options: SubagentRunnerOptions) {}

  async run(request: SubagentRequest): Promise<SubagentResult> {
    const startTime = Date.now();
    const config = SUBAGENT_CONFIGS[request.type];
    const registry = this.createSubagentRegistry(config);
    const agentLoop = this.options.createAgentLoop(
      registry,
      buildSubagentPrompt(request.type),
    );

    try {
      const generator = agentLoop.run(
        request.prompt,
        {
          ...request.executionContext,
          mode: "agent",
        },
        undefined,
        {
          maxIterations: config.maxIterations,
          timeoutMs: config.timeout,
          toolUsePolicy: {
            mode: "auto",
            allowedTools: config.allowedTools,
            evidenceRequired: true,
            allowPassiveEvidence: false,
            reason: "workspace_search",
          },
        },
      );

      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }

      const finalResult = result.value;
      const messages = finalResult.finalState.conversation.messages;
      const output = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content;
      const toolCalls = finalResult.finalState.conversation.toolCallHistory;
      const outputText = output ?? "";
      const outputBytes = this.estimateOutputBytes(outputText, toolCalls);
      const stopReason = this.resolveStopReason(
        finalResult.success,
        finalResult.error,
      );

      const subagentResult: SubagentResult = {
        success: finalResult.success,
        output: outputText,
        iterations: finalResult.iterations,
        duration: Date.now() - startTime,
        ...(finalResult.error ? { error: finalResult.error } : {}),
        metadata: {
          toolsCalled: toolCalls.map((toolCall) => toolCall.toolName),
          toolCallCount: toolCalls.length,
          outputBytes,
          stopReason,
        },
      };

      const limitedResult = this.applyResourceLimits(
        subagentResult,
        config,
      );

      this.recordRunMetrics(request.type, limitedResult);

      return limitedResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown subagent error";
      const subagentResult: SubagentResult = {
        success: false,
        output: "",
        iterations: 0,
        duration: Date.now() - startTime,
        error: message,
        metadata: {
          toolsCalled: [],
          toolCallCount: 0,
          outputBytes: 0,
          stopReason: this.resolveStopReason(false, message),
        },
      };

      this.recordRunMetrics(request.type, subagentResult);

      return subagentResult;
    }
  }

  getMetrics(): SubagentRunnerMetrics {
    return {
      totalRuns: this.metrics.totalRuns,
      successfulRuns: this.metrics.successfulRuns,
      failedRuns: this.metrics.failedRuns,
      totalDuration: this.metrics.totalDuration,
      totalIterations: this.metrics.totalIterations,
      runsByType: { ...this.metrics.runsByType },
      toolUsage: { ...this.metrics.toolUsage },
    };
  }

  createSubagentRegistry(config: SubagentConfig): ToolRegistry {
    const registry = this.options.createRegistry();

    for (const toolName of config.allowedTools) {
      const tool = this.options.parentRegistry.get(toolName);
      if (tool) {
        registry.register(tool);
      }
    }

    return registry;
  }

  private applyResourceLimits(
    result: SubagentResult,
    config: SubagentConfig,
  ): SubagentResult {
    const toolCallCount = result.metadata.toolCallCount ?? 0;
    if (toolCallCount > config.resourceLimits.maxToolCalls) {
      return {
        ...result,
        success: false,
        error: `Subagent exceeded tool call limit: ${toolCallCount}/${config.resourceLimits.maxToolCalls}`,
        metadata: {
          ...result.metadata,
          stopReason: "tool_calls",
          limitExceeded: "tool_calls",
        },
      };
    }

    const outputBytes = result.metadata.outputBytes ?? 0;
    if (outputBytes > config.resourceLimits.maxOutputBytes) {
      return {
        ...result,
        success: false,
        error: `Subagent exceeded output byte limit: ${outputBytes}/${config.resourceLimits.maxOutputBytes}`,
        metadata: {
          ...result.metadata,
          stopReason: "output_bytes",
          limitExceeded: "output_bytes",
        },
      };
    }

    return result;
  }

  private estimateOutputBytes(
    output: string,
    toolCalls: readonly ToolCallRecord[],
  ): number {
    const toolOutput = toolCalls
      .map((toolCall) => this.stringifyToolResult(toolCall.result))
      .join("");

    return Buffer.byteLength(output + toolOutput, "utf8");
  }

  private stringifyToolResult(result: unknown): string {
    if (typeof result === "string") {
      return result;
    }

    try {
      return JSON.stringify(result) ?? "";
    } catch {
      return String(result);
    }
  }

  private resolveStopReason(
    success: boolean,
    error: string | undefined,
  ): SubagentResult["metadata"]["stopReason"] {
    if (success) {
      return "completed";
    }

    if (error && /timed out|timeout/i.test(error)) {
      return "timeout";
    }

    return "runtime_error";
  }

  private recordRunMetrics(type: SubagentType, result: SubagentResult): void {
    this.metrics.totalRuns += 1;
    this.metrics.totalDuration += result.duration;
    this.metrics.totalIterations += result.iterations;
    this.metrics.runsByType[type] += 1;

    if (result.success) {
      this.metrics.successfulRuns += 1;
    } else {
      this.metrics.failedRuns += 1;
    }

    for (const toolName of result.metadata.toolsCalled) {
      this.metrics.toolUsage[toolName] =
        (this.metrics.toolUsage[toolName] ?? 0) + 1;
    }
  }
}
