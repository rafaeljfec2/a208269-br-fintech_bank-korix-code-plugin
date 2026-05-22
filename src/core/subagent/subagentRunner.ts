import type { AgentLoop } from "../runtime/agentLoop";
import type { ToolRegistry } from "../../harness/toolRegistry";
import {
  SUBAGENT_CONFIGS,
  buildSubagentPrompt,
  type SubagentRequest,
  type SubagentResult,
  type SubagentConfig,
} from "./subagentTypes";

export interface SubagentRunnerOptions {
  readonly parentRegistry: ToolRegistry;
  readonly createAgentLoop: (
    registry: ToolRegistry,
    systemPrompt: string,
  ) => AgentLoop;
  readonly createRegistry: () => ToolRegistry;
}

export class SubagentRunner {
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

      return {
        success: finalResult.success,
        output: output ?? "",
        iterations: finalResult.iterations,
        duration: Date.now() - startTime,
        ...(finalResult.error ? { error: finalResult.error } : {}),
        metadata: {
          toolsCalled: finalResult.finalState.conversation.toolCallHistory.map(
            (toolCall) => toolCall.toolName,
          ),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown subagent error";
      return {
        success: false,
        output: "",
        iterations: 0,
        duration: Date.now() - startTime,
        error: message,
        metadata: {
          toolsCalled: [],
        },
      };
    }
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
}
