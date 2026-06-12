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
import { WorkspaceEvidencePlanner } from "./WorkspaceEvidencePlanner";
import type {
  EvidencePack,
  EvidenceRequest,
  ExecutionGraphNode,
  ExecutionGraphSnapshot,
  ObservationSummary,
  ResponseValidationResult,
  ThinkingRunInput,
  ToolUsePolicy,
  WorkspaceEvidenceCollection,
  WorkspaceEvidenceCollectionRequest,
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
  readonly evidenceTimeoutMs?: number;
  readonly agentLoopTimeoutMs?: number;
  readonly evidenceProvider?: (
    request: EvidenceRequest,
  ) => Promise<EvidencePack>;
  readonly workspaceEvidenceCollector?: (
    request: WorkspaceEvidenceCollectionRequest,
  ) => Promise<WorkspaceEvidenceCollection>;
}

export class ThinkingOrchestrator {
  private static readonly DEFAULT_EVIDENCE_TIMEOUT_MS = 12000;
  private static readonly DEFAULT_AGENT_LOOP_TIMEOUT_MS = 60000;

  private readonly analyzer = new TaskAnalyzer();
  private readonly observationEngine = new ObservationEngine();
  private readonly reflectionEngine = new ReflectionEngine();
  private readonly hallucinationGuard = new HallucinationGuard();
  private readonly narrator = new RuntimeNarrator();
  private readonly toolUsePolicyResolver = new ToolUsePolicyResolver();
  private readonly workspaceEvidencePlanner = new WorkspaceEvidencePlanner();

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
    let agentLoopToolUsePolicy = toolUsePolicy;

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
      const workspaceEvidencePlan = this.workspaceEvidencePlanner.createPlan(
        input.initialMessage,
        profile,
        toolUsePolicy,
        input.context,
      );

      if (workspaceEvidencePlan && this.options.workspaceEvidenceCollector) {
        const collection = await this.collectWorkspaceEvidence({
          message: input.initialMessage,
          profile,
          context: input.context,
          plan: workspaceEvidencePlan,
        });

        if (collection.success) {
          evidence = collection.evidence;
          agentLoopToolUsePolicy = {
            ...toolUsePolicy,
            mode: "auto",
          };

          const contextNode = graph.addNode(
            "context",
            "Batch workspace evidence",
            collection.evidence.summary,
            {
              fileCount: collection.files.length,
              omittedCount: collection.omittedFiles.length,
              totalTokens: collection.evidence.totalTokens,
            },
          );
          graph.addEdge(analysisNode.id, contextNode.id, "depends_on");

          this.options.eventEmitter.emitEvent({
            type: "context_evidence",
            evidence: collection.evidence,
            timestamp: Date.now(),
          });
          this.options.eventEmitter.emitEvent({
            type: "thinking_step",
            item: this.narrator.evidence(collection.evidence),
            timestamp: Date.now(),
          });
        }
      }

      if (
        profile.requiresWorkspaceEvidence &&
        this.options.evidenceProvider &&
        evidence === undefined &&
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
          evidence = await this.withEvidenceTimeout(
            this.options.evidenceProvider({
              message: input.initialMessage,
              profile,
              context: input.context,
            }),
            "Workspace evidence collection timed out.",
          );

          if (evidence !== undefined) {
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
          }
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
        {
          toolUsePolicy: agentLoopToolUsePolicy,
          timeoutMs:
            this.options.agentLoopTimeoutMs ??
            ThinkingOrchestrator.DEFAULT_AGENT_LOOP_TIMEOUT_MS,
        },
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

  private async collectWorkspaceEvidence(
    request: WorkspaceEvidenceCollectionRequest,
  ): Promise<WorkspaceEvidenceCollection> {
    const id = `workspace-evidence-${Date.now()}`;

    this.options.eventEmitter.emitEvent({
      type: "thinking_step",
      item: this.narrator.step(
        "collecting_evidence",
        "Collecting workspace evidence",
        "Reading requested workspace files in a deterministic batch.",
        "pending",
        {
          kind: request.plan.kind,
          maxFiles: request.plan.maxFiles,
          targetHints: request.plan.targetHints,
        },
      ),
      timestamp: Date.now(),
    });
    this.options.eventEmitter.emitEvent({
      type: "tool_call",
      id,
      name: "CollectWorkspaceEvidence",
      input: request.plan,
      timestamp: Date.now(),
    });

    try {
      const collection = await this.withEvidenceTimeout(
        this.options.workspaceEvidenceCollector?.(request),
        "Workspace evidence collection timed out.",
      );
      const result = collection ?? {
        success: false,
        summary: "Workspace evidence collector is unavailable.",
        evidence: {
          summary: "Workspace evidence collector is unavailable.",
          providerContext: "",
          items: [],
          totalTokens: 0,
        },
        files: [],
        omittedFiles: [],
        duration: 0,
        error: "Workspace evidence collector is unavailable.",
      };

      this.options.eventEmitter.emitEvent({
        type: "tool_result",
        id,
        name: "CollectWorkspaceEvidence",
        success: result.success,
        result,
        duration: result.duration,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const failed: WorkspaceEvidenceCollection = {
        success: false,
        summary: "Workspace evidence collection failed.",
        evidence: {
          summary: "Workspace evidence collection failed.",
          providerContext: "",
          items: [],
          totalTokens: 0,
        },
        files: [],
        omittedFiles: [],
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      };

      this.options.eventEmitter.emitEvent({
        type: "tool_result",
        id,
        name: "CollectWorkspaceEvidence",
        success: false,
        result: failed,
        duration: 0,
        timestamp: Date.now(),
      });

      return failed;
    }
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

  private withEvidenceTimeout<T>(
    promise: Promise<T | undefined> | undefined,
    message: string,
  ): Promise<T | undefined> {
    if (promise === undefined) {
      return Promise.resolve(undefined);
    }

    const timeoutMs =
      this.options.evidenceTimeoutMs ??
      ThinkingOrchestrator.DEFAULT_EVIDENCE_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
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
