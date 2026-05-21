/**
 * Hook to process runtime events from extension
 */

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import type { ExtensionToWebviewMessage } from "../../shared/protocol";
import type {
  ThinkingTimelineItem,
  ToolExecution,
} from "../store/slices/chatSlice";
import { logger } from "../utils/logger";
import { formatToolActivity } from "../utils/toolActivityFormatter";

type AgentEventStatus = ThinkingTimelineItem["status"];

interface AgentEventListInput {
  readonly stage: string;
  readonly title: string;
  readonly summary?: string;
  readonly status?: AgentEventStatus;
  readonly timestamp?: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface BatchEvidenceDisplay {
  readonly summary: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export function useRuntimeEvents() {
  // Track current activity context - usar ref para persistir entre renders
  const currentActivityContextIdRef = useRef<string | null>(null);
  const eventListCounterRef = useRef(0);
  const lastCompletedChatIdRef = useRef<string | null>(null);
  const responseStreamingNotedRef = useRef(false);

  // Token batching - acumula tokens e faz flush periódico para reduzir re-renders
  const tokenBufferRef = useRef<{ chatId: string; tokens: string[] } | null>(
    null,
  );
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flushTokens = () => {
      if (tokenBufferRef.current && tokenBufferRef.current.tokens.length > 0) {
        const { chatId, tokens } = tokenBufferRef.current;
        const combinedTokens = tokens.join("");
        useStore.getState().appendStreamingToken(chatId, combinedTokens);
        tokenBufferRef.current = null;
      }
      flushTimerRef.current = null;
    };

    const bufferToken = (chatId: string, token: string) => {
      // Inicializar buffer se necessário
      if (!tokenBufferRef.current || tokenBufferRef.current.chatId !== chatId) {
        // Flush buffer anterior se houver
        if (tokenBufferRef.current) {
          flushTokens();
        }
        tokenBufferRef.current = { chatId, tokens: [] };
      }

      // Adicionar token ao buffer
      tokenBufferRef.current.tokens.push(token);

      // Agendar flush se não houver timer ativo (throttle de 50ms)
      if (!flushTimerRef.current) {
        flushTimerRef.current = window.setTimeout(
          flushTokens,
          50,
        ) as unknown as number;
      }
    };

    const createEventListItem = (
      input: AgentEventListInput,
    ): ThinkingTimelineItem => {
      eventListCounterRef.current += 1;

      return {
        id: `agent-event-${Date.now()}-${eventListCounterRef.current}`,
        stage: input.stage,
        title: input.title,
        summary: input.summary ?? "",
        status: input.status ?? "success",
        timestamp: input.timestamp ?? Date.now(),
        durationMs: input.durationMs,
        metadata: input.metadata,
      };
    };

    const addActiveEventItem = (input: AgentEventListInput): string => {
      const currentStore = useStore.getState();
      const chatId =
        currentStore.activeChatId ?? currentStore.createChat("Nova conversa");
      currentStore.addActiveThinkingItem(chatId, createEventListItem(input));
      return chatId;
    };

    const appendCompletedEventItem = (
      chatId: string | null,
      input: AgentEventListInput,
    ) => {
      if (!chatId) {
        return;
      }

      useStore
        .getState()
        .appendThinkingItemToLastAssistant(chatId, createEventListItem(input));
    };
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      // Usar getState() para evitar dependências no useEffect e múltiplos listeners
      const store = useStore.getState();
      const message = event.data;

      try {
        if (message.type === "init") {
          const { mode, model, isExecuting } = message.payload;
          store.setMode(mode);
          store.setModel(model);
          store.setExecuting(isExecuting);
          return;
        }

        if (message.type === "mode_changed") {
          store.setMode(message.payload.mode);
          return;
        }

        if (message.type === "runtime_event") {
          const runtimeEvent = message.payload.event;

          try {
            switch (runtimeEvent.type) {
              case "iteration_start": {
                const event = runtimeEvent;
                lastCompletedChatIdRef.current = null;
                responseStreamingNotedRef.current = false;
                store.setIteration(event.iteration);
                store.setExecuting(true);
                store.addTimelineEvent({
                  type: "iteration",
                  description: `Iteration ${event.iteration} started`,
                  status: "pending",
                });
                addActiveEventItem({
                  stage: "iteration_start",
                  title: `Iteration ${event.iteration} started`,
                  summary: "Agent loop started an execution step.",
                  status: "pending",
                  timestamp: event.timestamp,
                });

                // NOVO: Criar contexto de atividade para iteração
                currentActivityContextIdRef.current = store.startContext(
                  `Iteration ${event.iteration}`,
                );
                store.addActivityItem(currentActivityContextIdRef.current, {
                  category: "execution",
                  context: `Iteration ${event.iteration}`,
                  description: "Iteration started",
                  status: "pending",
                });
                break;
              }

              case "iteration_complete": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "iteration",
                  description: `Iteration ${event.iteration} completed`,
                  status: "success",
                  metadata: { hadToolCalls: event.hadToolCalls },
                });
                addActiveEventItem({
                  stage: "iteration_complete",
                  title: `Iteration ${event.iteration} completed`,
                  summary: event.hadToolCalls
                    ? "Completed after tool activity."
                    : "Completed without tool calls.",
                  status: "success",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                });

                // NOVO: Finalizar contexto de atividade
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: `Iteration ${event.iteration}`,
                    description: "Iteration completed",
                    status: "success",
                    duration: event.duration,
                  });
                  store.endContext(currentActivityContextIdRef.current);
                  currentActivityContextIdRef.current = null;
                }
                break;
              }

              case "token": {
                const event = runtimeEvent;
                // Garantir que há conversa ativa antes de processar streaming
                let chatId = useStore.getState().activeChatId;
                if (!chatId) {
                  chatId = useStore.getState().createChat("Nova conversa");
                }

                // Se estava thinking, finalizar antes de iniciar streaming
                const activeChat = useStore.getState().conversations[chatId];
                if (activeChat?.isThinking) {
                  store.finalizeThinking(chatId);
                }

                if (!responseStreamingNotedRef.current) {
                  addActiveEventItem({
                    stage: "token_stream",
                    title: "Streaming final response",
                    summary: "Validated assistant text is being sent to chat.",
                    status: "pending",
                    timestamp: event.timestamp,
                  });
                  responseStreamingNotedRef.current = true;
                }

                // Usar batching para reduzir re-renders (flush a cada 50ms)
                bufferToken(chatId, event.content);
                break;
              }

              case "thinking": {
                store.addTimelineEvent({
                  type: "thinking",
                  description: "Reasoning...",
                  status: "pending",
                });
                addActiveEventItem({
                  stage: "provider_thinking",
                  title: "Provider reasoning signal",
                  summary:
                    "Internal provider thinking received; raw reasoning hidden.",
                  status: "pending",
                  timestamp: runtimeEvent.timestamp,
                });

                // Provider thinking is intentionally not rendered raw.
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "thinking",
                    context: "Thinking",
                    description: "Provider reasoning signal received",
                    status: "pending",
                  });
                }
                break;
              }

              case "provider_request_start": {
                const event = runtimeEvent;
                const toolChoice = event.toolChoice
                  ? `, choice ${event.toolChoice}`
                  : "";

                store.addTimelineEvent({
                  type: "thinking",
                  description: "Waiting model",
                  status: "pending",
                  metadata: {
                    iteration: event.iteration,
                    correlationId: event.correlationId,
                    toolCount: event.toolCount,
                    toolChoice: event.toolChoice,
                  },
                });
                addActiveEventItem({
                  stage: "provider_request_start",
                  title: "Waiting model",
                  summary: `Provider request sent with ${event.toolCount} tool(s).`,
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: {
                    iteration: event.iteration,
                    correlationId: event.correlationId,
                    toolCount: event.toolCount,
                    toolChoice: event.toolChoice,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Provider",
                    description: `Waiting model (${event.toolCount} tool(s)${toolChoice})`,
                    status: "pending",
                    metadata: {
                      correlationId: event.correlationId,
                      toolCount: event.toolCount,
                      toolChoice: event.toolChoice,
                    },
                  });
                }
                break;
              }

              case "provider_first_output": {
                const event = runtimeEvent;

                addActiveEventItem({
                  stage: "provider_first_output",
                  title: "Model first output",
                  summary: `First ${event.outputKind} after ${event.latency}ms.`,
                  status: "success",
                  timestamp: event.timestamp,
                  durationMs: event.latency,
                  metadata: {
                    iteration: event.iteration,
                    correlationId: event.correlationId,
                    outputKind: event.outputKind,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Provider",
                    description: `First ${event.outputKind}`,
                    status: "success",
                    duration: event.latency,
                    metadata: {
                      correlationId: event.correlationId,
                      outputKind: event.outputKind,
                    },
                  });
                }
                break;
              }

              case "provider_request_end": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "thinking",
                  description: `Model response completed in ${event.duration}ms`,
                  status: "success",
                  metadata: {
                    iteration: event.iteration,
                    correlationId: event.correlationId,
                    stopReason: event.stopReason,
                    tokenCount: event.tokenCount,
                    hadToolCalls: event.hadToolCalls,
                  },
                });
                addActiveEventItem({
                  stage: "provider_request_end",
                  title: "Model response completed",
                  summary: `Provider finished in ${event.duration}ms with ${event.tokenCount} token(s).`,
                  status: "success",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                  metadata: {
                    iteration: event.iteration,
                    correlationId: event.correlationId,
                    stopReason: event.stopReason,
                    hadToolCalls: event.hadToolCalls,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Provider",
                    description: "Model response completed",
                    status: "success",
                    duration: event.duration,
                    metadata: {
                      correlationId: event.correlationId,
                      stopReason: event.stopReason,
                      tokenCount: event.tokenCount,
                      hadToolCalls: event.hadToolCalls,
                    },
                  });
                }
                break;
              }

              case "response_buffer_start": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "thinking",
                  description: "Buffering response for validation",
                  status: "pending",
                  metadata: { reason: event.reason },
                });
                addActiveEventItem({
                  stage: "response_buffer_start",
                  title: "Buffering response",
                  summary:
                    "Response is being held for workspace evidence validation.",
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: { reason: event.reason },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "thinking",
                    context: "Response validation",
                    description: "Buffering response",
                    status: "pending",
                    metadata: { reason: event.reason },
                  });
                }
                break;
              }

              case "response_buffer_flush": {
                const event = runtimeEvent;
                const title =
                  event.reason === "blocked"
                    ? "Buffered response blocked"
                    : "Buffered response released";
                const summary =
                  event.reason === "blocked"
                    ? `Response buffer blocked after ${event.duration}ms.`
                    : `Response buffer ${event.reason} after ${event.duration}ms.`;

                store.addTimelineEvent({
                  type: "thinking",
                  description: title,
                  status: event.reason === "blocked" ? "error" : "success",
                  metadata: {
                    reason: event.reason,
                    responseLength: event.responseLength,
                    duration: event.duration,
                  },
                });
                addActiveEventItem({
                  stage: "response_buffer_flush",
                  title,
                  summary,
                  status: event.reason === "blocked" ? "error" : "success",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                  metadata: {
                    reason: event.reason,
                    responseLength: event.responseLength,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "thinking",
                    context: "Response validation",
                    description: title,
                    status: event.reason === "blocked" ? "error" : "success",
                    duration: event.duration,
                    metadata: {
                      reason: event.reason,
                      responseLength: event.responseLength,
                    },
                  });
                }
                break;
              }

              case "thinking_step": {
                const event = runtimeEvent;
                const chatId =
                  useStore.getState().activeChatId ??
                  useStore.getState().createChat("Nova conversa");

                store.addActiveThinkingItem(chatId, {
                  id: event.item.id,
                  stage: event.item.stage,
                  title: event.item.title,
                  summary: event.item.summary,
                  status: event.item.status,
                  timestamp: event.item.timestamp,
                  durationMs: event.item.durationMs,
                  metadata: event.item.metadata,
                });

                store.addTimelineEvent({
                  type: "thinking",
                  description: event.item.title,
                  status:
                    event.item.status === "error"
                      ? "error"
                      : event.item.status === "pending"
                        ? "pending"
                        : "success",
                  metadata: {
                    stage: event.item.stage,
                    summary: event.item.summary,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "thinking",
                    context: event.item.title,
                    description: event.item.summary,
                    status:
                      event.item.status === "error"
                        ? "error"
                        : event.item.status === "pending"
                          ? "pending"
                          : "success",
                  });
                }
                break;
              }

              case "context_evidence": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "thinking",
                  description: event.evidence.summary,
                  status: event.evidence.items.length > 0 ? "success" : "error",
                  metadata: {
                    itemCount: event.evidence.items.length,
                    totalTokens: event.evidence.totalTokens,
                  },
                });
                addActiveEventItem({
                  stage: "context_evidence",
                  title: "Workspace evidence checked",
                  summary: event.evidence.summary,
                  status:
                    event.evidence.items.length > 0 ? "success" : "warning",
                  timestamp: event.timestamp,
                  metadata: {
                    itemCount: event.evidence.items.length,
                    totalTokens: event.evidence.totalTokens,
                  },
                });
                break;
              }

              case "observation_summary": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "thinking",
                  description: event.summary.summary,
                  status: event.summary.success ? "success" : "error",
                  metadata: {
                    sourceName: event.summary.sourceName,
                    truncated: event.summary.truncated,
                  },
                });
                addActiveEventItem({
                  stage: "observation_summary",
                  title: `Observed ${event.summary.sourceName}`,
                  summary: event.summary.summary,
                  status: event.summary.success ? "success" : "error",
                  timestamp: event.timestamp,
                  metadata: {
                    sourceName: event.summary.sourceName,
                    truncated: event.summary.truncated,
                  },
                });
                break;
              }

              case "reflection_summary": {
                const event = runtimeEvent;
                const chatId =
                  useStore.getState().activeChatId ??
                  useStore.getState().createChat("Nova conversa");
                store.addActiveThinkingItem(chatId, {
                  id: event.item.id,
                  stage: event.item.stage,
                  title: event.item.title,
                  summary: event.item.summary,
                  status: event.item.status,
                  timestamp: event.item.timestamp,
                  durationMs: event.item.durationMs,
                  metadata: event.item.metadata,
                });
                break;
              }

              case "response_validation": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "thinking",
                  description: event.validation.summary,
                  status:
                    event.validation.status === "passed" ? "success" : "error",
                  metadata: {
                    riskFlags: event.validation.riskFlags,
                    evidenceCount: event.validation.evidenceCount,
                  },
                });
                addActiveEventItem({
                  stage: "response_validation",
                  title: "Answer validated",
                  summary: event.validation.summary,
                  status:
                    event.validation.status === "passed"
                      ? "success"
                      : event.validation.status === "warning"
                        ? "warning"
                        : "error",
                  timestamp: event.timestamp,
                  metadata: {
                    riskFlags: event.validation.riskFlags,
                    evidenceCount: event.validation.evidenceCount,
                  },
                });
                break;
              }

              case "execution_graph_update": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "thinking",
                  description: `Execution graph updated (${event.graph.nodes.length} nodes)`,
                  status: "success",
                  metadata: {
                    nodes: event.graph.nodes.length,
                    edges: event.graph.edges.length,
                  },
                });
                appendCompletedEventItem(lastCompletedChatIdRef.current, {
                  stage: "execution_graph_update",
                  title: "Execution graph updated",
                  summary: `${event.graph.nodes.length} nodes, ${event.graph.edges.length} edges.`,
                  status: "success",
                  timestamp: event.timestamp,
                  metadata: {
                    nodes: event.graph.nodes.length,
                    edges: event.graph.edges.length,
                  },
                });
                break;
              }

              case "tool_call": {
                const event = runtimeEvent;
                const activity = formatToolActivity(event.name, event.input);
                const toolMetadata = {
                  toolCallId: event.id,
                  toolName: event.name,
                  input: event.input,
                  displayAction: activity.action,
                  targetLabel: activity.targetLabel,
                  displayLabel: activity.label,
                };

                // Add to timeline (existing behavior)
                store.addTimelineEvent({
                  type: "tool",
                  description: activity.label,
                  status: "pending",
                  metadata: toolMetadata,
                });
                addActiveEventItem({
                  stage: "tool_call",
                  title: activity.label,
                  summary: "Tool execution requested by the agent loop.",
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: toolMetadata,
                });
                store.updateMetrics({
                  toolCallCount:
                    (useStore.getState().metrics.toolCallCount ?? 0) + 1,
                });

                // NEW: Add pending tool to active message tracking
                const chatId = useStore.getState().activeChatId;
                if (chatId) {
                  const toolPending: ToolExecution = {
                    id: event.id,
                    name: event.name,
                    description: activity.label,
                    status: "pending",
                    duration: 0,
                    timestamp: event.timestamp,
                  };

                  // Use store-based tracking instead of local variable
                  store.addActiveMessageTool(chatId, toolPending);
                }

                // NOVO: Adicionar tool call ao activity log
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "tool",
                    context: activity.label,
                    description: `Executing ${activity.label}`,
                    status: "pending",
                    metadata: toolMetadata,
                  });
                }
                break;
              }

              case "tool_result": {
                const event = runtimeEvent;
                const batchEvidence =
                  event.name === "CollectWorkspaceEvidence"
                    ? getBatchEvidenceDisplay(event.result)
                    : undefined;
                const metadata = {
                  toolCallId: event.id,
                  toolName: event.name,
                  ...(batchEvidence?.metadata ?? {}),
                };

                // Add to timeline (existing behavior)
                store.addTimelineEvent({
                  type: "tool",
                  description: `Tool ${event.name} completed`,
                  status: event.success ? "success" : "error",
                  metadata: {
                    toolName: event.name,
                    ...(batchEvidence?.metadata ?? {}),
                  },
                });
                addActiveEventItem({
                  stage: "tool_result",
                  title: `${event.name} ${event.success ? "completed" : "failed"}`,
                  summary:
                    batchEvidence?.summary ??
                    `Tool finished in ${event.duration ?? 0}ms.`,
                  status: event.success ? "success" : "error",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                  metadata,
                });

                // NEW: Update tool status and duration in active message tracking
                const chatId = useStore.getState().activeChatId;
                if (chatId) {
                  // Use store-based tracking instead of local variable
                  store.updateActiveMessageTool(chatId, event.id, {
                    status: event.success ? "success" : "error",
                    duration: event.duration,
                  });
                }

                // NOVO: Adicionar tool result ao activity log
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "tool",
                    context: `Tool: ${event.name}`,
                    description: event.success
                      ? `${event.name} completed successfully`
                      : `${event.name} failed`,
                    status: event.success ? "success" : "error",
                    duration: event.duration,
                  });
                }
                break;
              }

              case "done": {
                logger.log("[RuntimeEvents] Done event received", {
                  timestamp: Date.now(),
                  activeChatId: useStore.getState().activeChatId,
                  isExecuting: useStore.getState().isExecuting,
                });

                // FIX: Flush pending tokens immediately and cancel timer
                // This prevents race condition where timer fires AFTER finalizeStreaming
                if (flushTimerRef.current) {
                  clearTimeout(flushTimerRef.current);
                  flushTimerRef.current = null;
                }
                flushTokens(); // Flush any remaining buffered tokens NOW

                // FIX: Garantir que há chat ativo ANTES de processar
                let chatId = useStore.getState().activeChatId;
                if (!chatId) {
                  logger.warn(
                    "[RuntimeEvents] No activeChatId, creating emergency chat",
                  );
                  chatId = useStore.getState().createChat("Nova conversa");

                  // Adicionar mensagem de sistema explicativa
                  store.addMessage(chatId, {
                    role: "system",
                    content:
                      "⚠️ Chat criado automaticamente para recuperar estado inconsistente.",
                  });
                }

                // Transfer activeMessageTools to message metadata
                const activeChat = useStore.getState().conversations[chatId];
                addActiveEventItem({
                  stage: "done",
                  title: "Provider turn completed",
                  summary: "Final response stream is ready to commit.",
                  status: "success",
                  timestamp: runtimeEvent.timestamp,
                  metadata: { stopReason: runtimeEvent.stopReason },
                });
                if (activeChat?.activeMessageTools) {
                  const totalDuration = activeChat.activeMessageTools.reduce(
                    (sum, t) => sum + t.duration,
                    0,
                  );

                  store.updateActiveMessageMetadata(chatId, {
                    execution: {
                      tools: activeChat.activeMessageTools,
                      isExpanded: false,
                      totalDuration,
                    },
                  });
                }

                logger.log(
                  "[RuntimeEvents] Calling finalizeStreaming for chat:",
                  chatId,
                );
                store.finalizeStreaming(chatId);
                lastCompletedChatIdRef.current = chatId;
                // Clear active message tools for next message
                store.clearActiveMessageTools(chatId);
                store.clearActiveThinkingItems(chatId);
                responseStreamingNotedRef.current = false;

                logger.log("[RuntimeEvents] Setting isExecuting=false");
                store.setExecuting(false);

                // Verificação de estado final
                const finalState = useStore.getState();
                const finalChat = chatId
                  ? finalState.conversations[chatId]
                  : null;
                logger.log("[RuntimeEvents] Final state after done:", {
                  isExecuting: finalState.isExecuting,
                  isStreaming: finalChat?.isStreaming,
                  hasStreamingContent: !!finalChat?.streamingContent,
                });

                break;
              }

              case "execution_complete": {
                const event = runtimeEvent;

                logger.log("[RuntimeEvents] execution_complete event:", {
                  success: event.success,
                  iterations: event.iterations,
                  totalToolCalls: event.metrics.totalToolCalls,
                  totalTokens: event.metrics.totalTokens,
                  duration: event.metrics.duration,
                });
                appendCompletedEventItem(
                  lastCompletedChatIdRef.current ??
                    useStore.getState().activeChatId,
                  {
                    stage: "execution_complete",
                    title: event.success
                      ? "Execution completed"
                      : "Execution failed",
                    summary: `${event.iterations} iteration(s), ${event.metrics.totalToolCalls} tool call(s), ${event.metrics.totalTokens} token(s).`,
                    status: event.success ? "success" : "error",
                    timestamp: event.timestamp,
                    durationMs: event.metrics.duration,
                    metadata: {
                      iterations: event.iterations,
                      totalToolCalls: event.metrics.totalToolCalls,
                      totalTokens: event.metrics.totalTokens,
                    },
                  },
                );
                if (event.metrics.latency) {
                  appendCompletedEventItem(
                    lastCompletedChatIdRef.current ??
                      useStore.getState().activeChatId,
                    {
                      stage: "latency_summary",
                      title: "Latency summary",
                      summary:
                        [
                          `Model ${event.metrics.latency.providerDurationMs}ms`,
                          `first output ${event.metrics.latency.providerFirstOutputLatencyMs}ms`,
                          `tools ${event.metrics.latency.toolDurationMs}ms`,
                          `approvals ${event.metrics.latency.approvalWaitMs}ms`,
                          `buffering ${event.metrics.latency.responseBufferDurationMs}ms`,
                          `overhead ${event.metrics.latency.iterationOverheadMs}ms`,
                        ].join(", ") + ".",
                      status: "success",
                      timestamp: event.timestamp,
                      durationMs: event.metrics.duration,
                      metadata: event.metrics.latency,
                    },
                  );
                }

                // NOVO: Atualizar métricas de tokens
                store.updateMetrics({
                  tokenCount: event.metrics.totalTokens ?? 0,
                  toolCallCount: event.metrics.totalToolCalls ?? 0,
                  iterationCount: event.iterations ?? 0,
                });

                // Set completion stats for ExecutionFeedback
                if (event.success) {
                  const duration = event.metrics.duration
                    ? event.metrics.duration / 1000
                    : 0;

                  const stats = {
                    iterations: event.iterations,
                    toolCalls: event.metrics.totalToolCalls ?? 0,
                    tokens: event.metrics.totalTokens ?? 0,
                    duration,
                    timestamp: Date.now(),
                  };

                  logger.log(
                    "[RuntimeEvents] Setting completion stats:",
                    stats,
                  );
                  store.setCompletionStats(stats);

                  // Auto-clear after 5 seconds
                  setTimeout(() => {
                    logger.log(
                      "[RuntimeEvents] Auto-clearing completion stats",
                    );
                    store.setCompletionStats(null);
                  }, 5000);
                }
                break;
              }

              case "error": {
                const event = runtimeEvent;
                const chatId = useStore.getState().activeChatId;
                if (chatId) {
                  store.finalizeStreaming(chatId);
                }
                store.setExecuting(false);
                responseStreamingNotedRef.current = false;
                store.addTimelineEvent({
                  type: "error",
                  description: event.error,
                  status: "error",
                  metadata: { error: event.error },
                });
                addActiveEventItem({
                  stage: "runtime_error",
                  title: "Runtime error",
                  summary: event.error,
                  status: "error",
                  timestamp: event.timestamp,
                  metadata: { recoverable: event.recoverable },
                });
                break;
              }

              case "checkpoint_created": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "checkpoint",
                  description: "Checkpoint created",
                  status: "success",
                  metadata: { checkpointId: event.checkpointId },
                });
                addActiveEventItem({
                  stage: "checkpoint_created",
                  title: "Checkpoint created",
                  summary: `${event.filesChanged ?? 0} changed file(s) captured.`,
                  status: "success",
                  timestamp: event.timestamp,
                  metadata: { checkpointId: event.checkpointId },
                });
                break;
              }

              case "checkpoint_restored": {
                const event = runtimeEvent;
                store.addTimelineEvent({
                  type: "checkpoint",
                  description: "Checkpoint restored",
                  status: "success",
                  metadata: { checkpointId: event.checkpointId },
                });
                addActiveEventItem({
                  stage: "checkpoint_restored",
                  title: "Checkpoint restored",
                  summary: "Runtime state restored from checkpoint.",
                  status: "success",
                  timestamp: event.timestamp,
                  metadata: { checkpointId: event.checkpointId },
                });
                break;
              }

              case "user_question": {
                const event = runtimeEvent;

                logger.log("[useRuntimeEvents] user_question received:", event);

                addActiveEventItem({
                  stage: "user_question",
                  title: `Asked ${event.title}`,
                  summary: `${event.options.length} option(s) presented to the user.`,
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: { questionId: event.questionId, mode: event.mode },
                });

                // Render a single in-chat question panel.
                store.setActiveQuestion({
                  questionId: event.questionId,
                  title: event.title,
                  question: event.question,
                  mode: event.mode,
                  options: event.options,
                  timeoutMs: event.timeoutMs,
                  defaultAnswer: event.defaultAnswer,
                });

                // Activity log
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "User Question",
                    description: `Asked: ${event.title}`,
                    status: "pending",
                  });
                }
                break;
              }

              case "user_answer": {
                const event = runtimeEvent;
                const source = event.isTimeout ? " (timeout)" : "";

                // Clear active question from UI
                store.clearActiveQuestion();
                addActiveEventItem({
                  stage: "user_answer",
                  title: "User answered",
                  summary: event.isTimeout
                    ? "Question timed out."
                    : event.answers.join(", "),
                  status: event.isTimeout ? "warning" : "success",
                  timestamp: event.timestamp,
                  metadata: { questionId: event.questionId },
                });

                // Activity log
                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "User Answer",
                    description: `Answered${source}: ${event.answers.join(", ")}`,
                    status: "success",
                  });
                }
                break;
              }

              // Guard events
              case "stall_detected": {
                const event = runtimeEvent;
                const stallSeconds = Math.round(event.timeSinceActivity / 1000);

                store.addTimelineEvent({
                  type: "error",
                  description: `Stall detected: ${stallSeconds}s without activity`,
                  status: "error",
                  metadata: {
                    timeSinceActivity: event.timeSinceActivity,
                    iteration: event.iteration,
                  },
                });
                addActiveEventItem({
                  stage: "stall_detected",
                  title: "Stall detected",
                  summary: `${stallSeconds}s without runtime activity.`,
                  status: "error",
                  timestamp: event.timestamp,
                  metadata: {
                    timeSinceActivity: event.timeSinceActivity,
                    iteration: event.iteration,
                  },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "error",
                    context: "Loop Guard",
                    description: `No activity for ${stallSeconds}s`,
                    status: "error",
                  });
                }
                break;
              }

              case "duplicate_tool_detected": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "error",
                  description: `Duplicate tool: ${event.toolName} (${event.count}x)`,
                  status: "error",
                  metadata: { toolName: event.toolName, count: event.count },
                });
                addActiveEventItem({
                  stage: "duplicate_tool_detected",
                  title: "Duplicate tool detected",
                  summary: `${event.toolName} called ${event.count} times.`,
                  status: "warning",
                  timestamp: event.timestamp,
                  metadata: { toolName: event.toolName, count: event.count },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "error",
                    context: "Loop Guard",
                    description: `Tool ${event.toolName} called ${event.count} times`,
                    status: "error",
                  });
                }
                break;
              }

              case "loop_warning": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "error",
                  description: `Loop warning: ${event.reason}`,
                  status: "error",
                  metadata: {
                    reason: event.reason,
                    iteration: event.iteration,
                  },
                });
                addActiveEventItem({
                  stage: "loop_warning",
                  title: "Loop warning",
                  summary: event.reason,
                  status: "warning",
                  timestamp: event.timestamp,
                  metadata: { iteration: event.iteration },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "error",
                    context: "Loop Guard",
                    description: event.reason,
                    status: "error",
                  });
                }
                break;
              }

              // Recovery events
              case "recovery_started": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "checkpoint",
                  description: `Recovery started: ${event.action} (attempt ${event.attempt})`,
                  status: "pending",
                  metadata: { action: event.action, attempt: event.attempt },
                });
                addActiveEventItem({
                  stage: "recovery_started",
                  title: `Recovery started: ${event.action}`,
                  summary: `Attempt ${event.attempt}.`,
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: { action: event.action, attempt: event.attempt },
                });
                break;
              }

              case "recovery_complete": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "checkpoint",
                  description: `Recovery ${event.success ? "succeeded" : "failed"}: ${event.action}`,
                  status: event.success ? "success" : "error",
                  metadata: { action: event.action, success: event.success },
                });
                addActiveEventItem({
                  stage: "recovery_complete",
                  title: `Recovery ${event.success ? "completed" : "failed"}`,
                  summary: event.action,
                  status: event.success ? "success" : "error",
                  timestamp: event.timestamp,
                  metadata: { action: event.action },
                });
                break;
              }

              // Control events
              case "cancelled": {
                const event = runtimeEvent;
                const chatId = useStore.getState().activeChatId;

                if (chatId) {
                  store.finalizeStreaming(chatId);
                }
                store.setExecuting(false);
                responseStreamingNotedRef.current = false;

                store.addTimelineEvent({
                  type: "error",
                  description: `Cancelled: ${event.reason}`,
                  status: "error",
                  metadata: {
                    reason: event.reason,
                    iteration: event.iteration,
                  },
                });
                addActiveEventItem({
                  stage: "cancelled",
                  title: "Execution cancelled",
                  summary: event.reason,
                  status: "error",
                  timestamp: event.timestamp,
                  metadata: { iteration: event.iteration },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Control",
                    description: `Execution cancelled: ${event.reason}`,
                    status: "error",
                  });
                }
                break;
              }

              case "paused": {
                store.addTimelineEvent({
                  type: "checkpoint",
                  description: "Execution paused",
                  status: "pending",
                });
                addActiveEventItem({
                  stage: "paused",
                  title: "Execution paused",
                  summary: `Paused at iteration ${runtimeEvent.iteration}.`,
                  status: "pending",
                  timestamp: runtimeEvent.timestamp,
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Control",
                    description: "Execution paused",
                    status: "pending",
                  });
                }
                break;
              }

              case "resumed": {
                store.addTimelineEvent({
                  type: "checkpoint",
                  description: "Execution resumed",
                  status: "success",
                });
                addActiveEventItem({
                  stage: "resumed",
                  title: "Execution resumed",
                  summary: `Resumed at iteration ${runtimeEvent.iteration}.`,
                  status: "success",
                  timestamp: runtimeEvent.timestamp,
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "execution",
                    context: "Control",
                    description: "Execution resumed",
                    status: "success",
                  });
                }
                break;
              }

              // Tool approval events
              case "tool_approval_required": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "tool",
                  description: `Approval required: ${event.name}`,
                  status: "pending",
                  metadata: { toolName: event.name },
                });
                addActiveEventItem({
                  stage: "tool_approval_required",
                  title: `Approval required: ${event.name}`,
                  summary: "Waiting for user approval before tool execution.",
                  status: "pending",
                  timestamp: event.timestamp,
                  metadata: { toolName: event.name },
                });
                break;
              }

              case "tool_approved": {
                const event = runtimeEvent;
                const approvalSummary =
                  event.duration !== undefined
                    ? `User approved tool execution after ${event.duration}ms.`
                    : "User approved tool execution.";

                store.addTimelineEvent({
                  type: "tool",
                  description: `Tool approved: ${event.name}`,
                  status: "success",
                  metadata: { toolName: event.name, duration: event.duration },
                });
                addActiveEventItem({
                  stage: "tool_approved",
                  title: `Tool approved: ${event.name}`,
                  summary: approvalSummary,
                  status: "success",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                  metadata: { toolName: event.name },
                });
                break;
              }

              case "tool_denied": {
                const event = runtimeEvent;
                const denialSummary =
                  event.duration !== undefined
                    ? `${event.reason} after ${event.duration}ms.`
                    : event.reason;

                store.addTimelineEvent({
                  type: "tool",
                  description: `Tool denied: ${event.name} - ${event.reason}`,
                  status: "error",
                  metadata: {
                    toolName: event.name,
                    reason: event.reason,
                    duration: event.duration,
                  },
                });
                addActiveEventItem({
                  stage: "tool_denied",
                  title: `Tool denied: ${event.name}`,
                  summary: denialSummary,
                  status: "error",
                  timestamp: event.timestamp,
                  durationMs: event.duration,
                  metadata: { toolName: event.name },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "tool",
                    context: `Tool: ${event.name}`,
                    description: `Denied: ${event.reason}`,
                    status: "error",
                  });
                }
                break;
              }

              // Patch events
              case "patch_applied": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "tool",
                  description: `Patch applied: ${event.file}:${event.lineNumber} (${event.operation})`,
                  status: "success",
                  metadata: {
                    file: event.file,
                    lineNumber: event.lineNumber,
                    operation: event.operation,
                  },
                });
                addActiveEventItem({
                  stage: "patch_applied",
                  title: "Patch applied",
                  summary: `${event.operation} at ${event.file}:${event.lineNumber}.`,
                  status: "success",
                  timestamp: event.timestamp,
                  metadata: { file: event.file, operation: event.operation },
                });
                break;
              }

              case "patch_failed": {
                const event = runtimeEvent;

                store.addTimelineEvent({
                  type: "error",
                  description: `Patch failed: ${event.file} - ${event.error}`,
                  status: "error",
                  metadata: { file: event.file, error: event.error },
                });
                addActiveEventItem({
                  stage: "patch_failed",
                  title: "Patch failed",
                  summary: `${event.file}: ${event.error}`,
                  status: "error",
                  timestamp: event.timestamp,
                  metadata: { file: event.file },
                });

                if (currentActivityContextIdRef.current) {
                  store.addActivityItem(currentActivityContextIdRef.current, {
                    category: "error",
                    context: "Patch",
                    description: `Failed to patch ${event.file}: ${event.error}`,
                    status: "error",
                  });
                }
                break;
              }

              default: {
                // Unhandled event type - log warning but don't crash
                logger.warn(
                  "[RuntimeEvents] Unhandled event type:",
                  runtimeEvent,
                );
                break;
              }
            }
          } catch (eventError) {
            // Event-specific error - log but don't crash the listener
            logger.error("[RuntimeEvents] Error processing runtime event:", {
              eventType: runtimeEvent.type,
              error: eventError,
              event: runtimeEvent,
            });

            // Add error to timeline for visibility
            try {
              store.addTimelineEvent({
                type: "error",
                description: `Event processing error: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
                status: "error",
                metadata: { eventType: runtimeEvent.type },
              });
            } catch {
              // If timeline update fails, just log
              logger.error(
                "[RuntimeEvents] Failed to add event error to timeline",
              );
            }
          }
        }

        if (message.type === "terminal_session_created") {
          const { sessionId, shellPath } = message.payload;
          store.createSession(sessionId, shellPath);
        }

        if (message.type === "terminal_output") {
          const { sessionId, data } = message.payload;
          store.appendOutput(sessionId, data);
        }
      } catch (error) {
        // Top-level error - log and continue listening
        logger.error("[RuntimeEvents] Critical error in message handler:", {
          messageType: message.type,
          error,
          message,
        });

        // Still try to add to timeline
        try {
          store.addTimelineEvent({
            type: "error",
            description: `Message handler error: ${error instanceof Error ? error.message : String(error)}`,
            status: "error",
          });
        } catch {
          // If even timeline fails, just log
          logger.error(
            "[RuntimeEvents] Failed to add critical error to timeline",
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      // Cleanup: remover listener
      window.removeEventListener("message", handleMessage);

      // Cleanup: flush pending tokens e limpar timer
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTokens(); // Flush final antes de desmontar
      }
    };
  }, []); // Array vazio - listener registrado apenas uma vez
}

function getBatchEvidenceDisplay(
  result: unknown,
): BatchEvidenceDisplay | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const files = Array.isArray(result.files) ? result.files : [];
  const omittedFiles = Array.isArray(result.omittedFiles)
    ? result.omittedFiles
    : [];

  return {
    summary: `Collected ${files.length} file(s), omitted ${omittedFiles.length} file(s).`,
    metadata: {
      fileCount: files.length,
      omittedCount: omittedFiles.length,
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
