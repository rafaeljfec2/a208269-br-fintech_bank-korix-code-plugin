import type { Logger } from "../../../telemetry/logger";
import type {
  AgentLoopResult,
  AgentLoopRunOptions,
  RuntimeMetricsSnapshot,
  RuntimeStateSnapshot,
} from "../runtimeTypes";
import type { RuntimeEvent, RuntimeEventEmitter } from "../runtimeEvents";
import { ExecutionGraph } from "./ExecutionGraph";
import { HallucinationGuard } from "./HallucinationGuard";
import { ObservationEngine } from "./ObservationEngine";
import { ReflectionEngine } from "./ReflectionEngine";
import { RuntimeNarrator } from "./RuntimeNarrator";
import { TaskAnalyzer } from "./TaskAnalyzer";
import { ToolUsePolicyResolver } from "./ToolUsePolicyResolver";
import type {
  EvidencePack,
  EvidenceRequest,
  ExecutionGraphNode,
  ExecutionGraphSnapshot,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingRunInput,
  ToolUsePolicy,
} from "./types";

export interface AgentLoopLike {
  run(
    initialMessage: string,
    context: ThinkingRunInput["context"],
    previousMessages?: ThinkingRunInput["previousMessages"],
    options?: AgentLoopRunOptions,
  ): AsyncGenerator<RuntimeEvent, AgentLoopResult>;
}

export interface ThinkingOrchestratorOptions {
  readonly agentLoop: AgentLoopLike;
  readonly eventEmitter: RuntimeEventEmitter;
  readonly logger: Logger;
  readonly evidenceProvider?: (
    request: EvidenceRequest,
  ) => Promise<EvidencePack>;
}

export class ThinkingOrchestrator {
  private readonly analyzer = new TaskAnalyzer();
  private readonly observationEngine = new ObservationEngine();
  private readonly reflectionEngine = new ReflectionEngine();
  private readonly hallucinationGuard = new HallucinationGuard();
  private readonly narrator = new RuntimeNarrator();
  private readonly toolUsePolicyResolver = new ToolUsePolicyResolver();

  constructor(private readonly options: ThinkingOrchestratorOptions) {}

  async *run(
    input: ThinkingRunInput,
  ): AsyncGenerator<RuntimeEvent, AgentLoopResult> {
    const profile = this.analyzer.analyze(input.initialMessage, input.context);
    const toolUsePolicy = this.toolUsePolicyResolver.resolve(
      input.initialMessage,
      profile,
      input.context,
    );
    const graph = new ExecutionGraph();
    const observations: ObservationSummary[] = [];
    const toolNodes = new Map<string, ExecutionGraphNode>();
    let evidence: EvidencePack | undefined;
    let latestValidation: ResponseValidationResult | undefined;
    let streamedResponse = "";
    let responseValidated = false;
    let responseBufferStartedAt: number | undefined;
    let responseBufferDurationMs = 0;

    const analysisNode = graph.addNode(
      "analysis",
      "Task analysis",
      profile.summary,
      { intent: profile.intent, riskLevel: profile.riskLevel },
    );

    const shouldBufferResponse = this.shouldBufferResponse(profile);
    if (shouldBufferResponse) {
      responseBufferStartedAt = Date.now();
      this.options.eventEmitter.beginResponseBuffering();
      this.options.eventEmitter.emitEvent({
        type: "response_buffer_start",
        reason: "workspace_evidence_validation",
        timestamp: responseBufferStartedAt,
      });
    }

    this.options.eventEmitter.emitEvent({
      type: "thinking_step",
      item: this.narrator.profile(profile),
      timestamp: Date.now(),
    });

    const subscription = this.options.eventEmitter.onEvent((event) => {
      if (event.type === "token" && !shouldBufferResponse) {
        streamedResponse += event.content;
      }

      if (event.type === "tool_call") {
        const node = graph.addNode(
          "tool_call",
          event.name,
          `Calling ${event.name}`,
          {
            input: event.input,
          },
        );
        toolNodes.set(event.id, node);
        graph.addEdge(analysisNode.id, node.id, "caused");
      }

      if (event.type === "tool_result") {
        const summary = this.observationEngine.summarizeToolResult(
          event.name,
          event.result,
          event.success,
        );
        observations.push(summary);

        const node = graph.addNode("observation", event.name, summary.summary, {
          success: event.success,
          rawSize: summary.rawSize,
        });
        graph.addEdge(
          toolNodes.get(event.id)?.id ?? analysisNode.id,
          node.id,
          "caused",
        );

        this.options.eventEmitter.emitEvent({
          type: "observation_summary",
          summary,
          timestamp: Date.now(),
        });

        this.options.eventEmitter.emitEvent({
          type: "thinking_step",
          item: this.narrator.observation(summary),
          timestamp: Date.now(),
        });

        const reflection = this.reflectionEngine.reflectOnObservation(summary);
        if (reflection) {
          const reflectionNode = graph.addNode(
            "reflection",
            reflection.title,
            reflection.summary,
            reflection.metadata,
          );
          graph.addEdge(node.id, reflectionNode.id, "retry");
          this.options.eventEmitter.emitEvent({
            type: "reflection_summary",
            item: reflection,
            timestamp: Date.now(),
          });
        }
      }
    });

    try {
      if (
        profile.requiresWorkspaceEvidence &&
        this.options.evidenceProvider &&
        toolUsePolicy.allowPassiveEvidence
      ) {
        this.options.eventEmitter.emitEvent({
          type: "thinking_step",
          item: this.narrator.step(
            "checking_context",
            "Checking workspace context",
            "Selecting relevant workspace evidence before answering.",
            "pending",
          ),
          timestamp: Date.now(),
        });

        try {
          evidence = await this.options.evidenceProvider({
            message: input.initialMessage,
            profile,
            context: input.context,
          });

          const contextNode = graph.addNode(
            "context",
            "Workspace evidence",
            evidence.summary,
            {
              itemCount: evidence.items.length,
              totalTokens: evidence.totalTokens,
            },
          );
          graph.addEdge(analysisNode.id, contextNode.id, "depends_on");

          this.options.eventEmitter.emitEvent({
            type: "context_evidence",
            evidence,
            timestamp: Date.now(),
          });
          this.options.eventEmitter.emitEvent({
            type: "thinking_step",
            item: this.narrator.evidence(evidence),
            timestamp: Date.now(),
          });
        } catch (error) {
          this.options.logger.warn("Failed to collect thinking evidence", {
            error: error instanceof Error ? error.message : String(error),
          });
          this.options.eventEmitter.emitEvent({
            type: "thinking_step",
            item: this.narrator.step(
              "collecting_evidence",
              "Workspace evidence unavailable",
              "Continuing with runtime tools and explicit uncertainty if needed.",
              "warning",
            ),
            timestamp: Date.now(),
          });
        }
      }

      this.options.eventEmitter.emitEvent({
        type: "thinking_step",
        item: this.narrator.step(
          "executing_loop",
          "Running supervised agent loop",
          "Executing provider and tool loop under runtime guards.",
          "pending",
        ),
        timestamp: Date.now(),
      });

      const runtimeMessage = this.buildRuntimeMessage(
        input.initialMessage,
        evidence,
      );
      const generator = this.options.agentLoop.run(
        runtimeMessage,
        input.context,
        input.previousMessages,
        { toolUsePolicy },
      );

      let finalResult: AgentLoopResult | undefined;
      while (true) {
        const next = await generator.next();
        if (next.done) {
          finalResult = next.value;
          break;
        }

        if (next.value.type === "done") {
          latestValidation = this.validateResponse(
            profile,
            evidence,
            observations,
            graph,
            toolUsePolicy,
            shouldBufferResponse
              ? this.options.eventEmitter.getBufferedResponse()
              : streamedResponse,
            shouldBufferResponse,
            responseBufferStartedAt,
          );
          if (shouldBufferResponse && responseBufferStartedAt !== undefined) {
            responseBufferDurationMs = Date.now() - responseBufferStartedAt;
          }
          responseValidated = true;
        }

        yield next.value.type === "execution_complete"
          ? {
              ...next.value,
              metrics: this.withResponseBufferLatency(
                next.value.metrics,
                responseBufferDurationMs,
              ),
            }
          : next.value;
      }

      if (
        shouldBufferResponse &&
        !responseValidated &&
        !this.options.eventEmitter.isResponseBufferingEmpty()
      ) {
        latestValidation = this.validateResponse(
          profile,
          evidence,
          observations,
          graph,
          toolUsePolicy,
          this.options.eventEmitter.getBufferedResponse(),
          true,
          responseBufferStartedAt,
        );
        if (responseBufferStartedAt !== undefined) {
          responseBufferDurationMs = Date.now() - responseBufferStartedAt;
        }
      }

      if (!shouldBufferResponse && !responseValidated) {
        latestValidation = this.validateResponse(
          profile,
          evidence,
          observations,
          graph,
          toolUsePolicy,
          streamedResponse,
          false,
          undefined,
        );
      }

      const graphSnapshot = graph.snapshot();

      this.options.eventEmitter.emitEvent({
        type: "execution_graph_update",
        graph: graphSnapshot,
        timestamp: Date.now(),
      });

      if (!finalResult) {
        throw new Error("Agent loop completed without a final result.");
      }

      return {
        ...finalResult,
        finalState: this.withThinkingSnapshot(
          finalResult.finalState,
          profile,
          evidence,
          observations,
          latestValidation,
          graphSnapshot,
        ),
        metrics: this.withResponseBufferLatency(
          finalResult.metrics,
          responseBufferDurationMs,
        ),
      };
    } finally {
      subscription.dispose();
      this.options.eventEmitter.endResponseBuffering();
    }
  }

  private shouldBufferResponse(
    profile: ReturnType<TaskAnalyzer["analyze"]>,
  ): boolean {
    return profile.requiresWorkspaceEvidence;
  }

  private validateResponse(
    profile: ReturnType<TaskAnalyzer["analyze"]>,
    evidence: EvidencePack | undefined,
    observations: readonly ObservationSummary[],
    graph: ExecutionGraph,
    toolUsePolicy: ToolUsePolicy,
    response: string,
    flushResponse: boolean,
    responseBufferStartedAt: number | undefined,
  ): ResponseValidationResult {
    const baseValidation = this.hallucinationGuard.validate({
      profile,
      evidence,
      observations,
      response,
    });
    const validation = this.applyToolUsePolicyValidation(
      baseValidation,
      observations,
      toolUsePolicy,
    );

    const node = graph.addNode(
      "validation",
      "Response validation",
      validation.summary,
      { status: validation.status, riskFlags: validation.riskFlags },
    );

    const responseNode = graph.addNode(
      "response",
      "Final response",
      response.length > 0
        ? "Assistant response prepared."
        : "No assistant text response.",
      { responseLength: response.length },
    );
    graph.addEdge(node.id, responseNode.id, "validates");

    this.options.eventEmitter.emitEvent({
      type: "response_validation",
      validation,
      timestamp: Date.now(),
    });
    this.options.eventEmitter.emitEvent({
      type: "thinking_step",
      item: this.narrator.validation(validation),
      timestamp: Date.now(),
    });

    if (flushResponse) {
      const finalResponse =
        validation.status === "blocked"
          ? this.buildBlockedToolUseResponse(toolUsePolicy)
          : this.hallucinationGuard.applyValidation(response, validation);
      const bufferDuration =
        responseBufferStartedAt !== undefined
          ? Date.now() - responseBufferStartedAt
          : 0;
      this.options.eventEmitter.emitEvent({
        type: "response_buffer_flush",
        reason:
          validation.status === "blocked"
            ? "blocked"
            : finalResponse.length > 0
              ? "validated"
              : "empty",
        duration: bufferDuration,
        responseLength: finalResponse.length,
        timestamp: Date.now(),
      });
      this.options.eventEmitter.flushBufferedResponse(finalResponse);
    }

    return validation;
  }

  private buildRuntimeMessage(
    message: string,
    evidence?: EvidencePack,
  ): string {
    if (!evidence || evidence.providerContext.trim().length === 0) {
      return message;
    }

    return [
      message,
      "",
      "<korix_workspace_evidence>",
      evidence.providerContext,
      "</korix_workspace_evidence>",
      "",
      "Use the workspace evidence above for project-specific claims. If it is insufficient, say so explicitly.",
    ].join("\n");
  }

  private withResponseBufferLatency(
    metrics: RuntimeMetricsSnapshot,
    responseBufferDurationMs: number,
  ): RuntimeMetricsSnapshot {
    if (responseBufferDurationMs <= 0) {
      return metrics;
    }

    const currentLatency = metrics.latency ?? {
      providerDurationMs: 0,
      providerFirstOutputLatencyMs: 0,
      toolDurationMs: 0,
      approvalWaitMs: 0,
      responseBufferDurationMs: 0,
      iterationOverheadMs: metrics.duration,
    };
    const responseBufferTotal =
      currentLatency.responseBufferDurationMs + responseBufferDurationMs;
    const measuredLatency =
      currentLatency.providerDurationMs +
      currentLatency.toolDurationMs +
      currentLatency.approvalWaitMs +
      responseBufferTotal;

    return {
      ...metrics,
      latency: {
        ...currentLatency,
        responseBufferDurationMs: responseBufferTotal,
        iterationOverheadMs: Math.max(0, metrics.duration - measuredLatency),
      },
    };
  }

  private applyToolUsePolicyValidation(
    validation: ResponseValidationResult,
    observations: readonly ObservationSummary[],
    toolUsePolicy: ToolUsePolicy,
  ): ResponseValidationResult {
    if (toolUsePolicy.mode !== "required") {
      return validation;
    }

    const hasSuccessfulObservation = observations.some(
      (observation) => observation.success,
    );

    if (hasSuccessfulObservation) {
      return validation;
    }

    return {
      ...validation,
      status: "blocked",
      summary: "Required tool execution did not produce successful evidence.",
      requiresEvidence: true,
      evidenceCount: 0,
      riskFlags: [...validation.riskFlags, "required_tool_not_satisfied"],
      suggestedPrefix: undefined,
    };
  }

  private buildBlockedToolUseResponse(toolUsePolicy: ToolUsePolicy): string {
    if (
      toolUsePolicy.reason === "workspace_read" ||
      toolUsePolicy.reason === "workspace_search" ||
      toolUsePolicy.reason === "workspace_inspect"
    ) {
      return "Não consegui executar a leitura solicitada com as ferramentas disponíveis.";
    }

    return "Não consegui executar as ferramentas necessárias para atender a solicitação.";
  }

  private withThinkingSnapshot(
    snapshot: RuntimeStateSnapshot,
    profile: ReturnType<TaskAnalyzer["analyze"]>,
    evidence: EvidencePack | undefined,
    observations: readonly ObservationSummary[],
    validation: ResponseValidationResult | undefined,
    graph: ExecutionGraphSnapshot,
  ): RuntimeStateSnapshot {
    return {
      ...snapshot,
      memory: {
        ...snapshot.memory,
        thinking: {
          taskProfile: profile,
          evidencePack: evidence,
          observationSummaries: observations,
          validationResult: validation,
          executionGraph: graph,
        },
      },
    };
  }
}
