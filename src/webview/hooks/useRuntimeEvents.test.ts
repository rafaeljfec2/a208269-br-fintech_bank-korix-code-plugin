/**
 * useRuntimeEvents hook tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useRuntimeEvents } from "./useRuntimeEvents";
import { useStore } from "../store";

// Mock store
const mockGetState = vi.fn();
vi.mock("../store", () => ({
  useStore: vi.fn(),
}));

describe("useRuntimeEvents", () => {
  const mockAddMessage = vi.fn();
  const mockAppendStreamingToken = vi.fn();
  const mockFinalizeStreaming = vi.fn();
  const mockAddTimelineEvent = vi.fn();
  const mockSetExecuting = vi.fn();
  const mockSetIteration = vi.fn();
  const mockUpdateMetrics = vi.fn();
  const mockSetCompletionStats = vi.fn();
  const mockSetMode = vi.fn();
  const mockSetModel = vi.fn();
  const mockCreateSession = vi.fn();
  const mockAppendOutput = vi.fn();
  const mockCreateChat = vi.fn();
  const mockUpdateActiveMessageMetadata = vi.fn();
  const mockClearActiveMessageTools = vi.fn();
  const mockAddActiveThinkingItem = vi.fn();
  const mockAppendThinkingItemToLastAssistant = vi.fn();
  const mockReplaceLastAssistantFallbackContent = vi.fn();
  const mockClearActiveThinkingItems = vi.fn();
  const mockSetActiveQuestion = vi.fn();
  const mockClearActiveQuestion = vi.fn();
  // Activity Log mocks
  const mockStartContext = vi.fn();
  const mockEndContext = vi.fn();
  const mockAddActivityItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createChat to return a chat ID
    mockCreateChat.mockReturnValue("test-chat-id");
    mockStartContext.mockReturnValue("test-context-id");

    const state = {
      addMessage: mockAddMessage,
      appendStreamingToken: mockAppendStreamingToken,
      finalizeStreaming: mockFinalizeStreaming,
      addTimelineEvent: mockAddTimelineEvent,
      setExecuting: mockSetExecuting,
      setIteration: mockSetIteration,
      updateMetrics: mockUpdateMetrics,
      setCompletionStats: mockSetCompletionStats,
      setMode: mockSetMode,
      setModel: mockSetModel,
      createSession: mockCreateSession,
      appendOutput: mockAppendOutput,
      createChat: mockCreateChat,
      updateActiveMessageMetadata: mockUpdateActiveMessageMetadata,
      clearActiveMessageTools: mockClearActiveMessageTools,
      addActiveThinkingItem: mockAddActiveThinkingItem,
      appendThinkingItemToLastAssistant: mockAppendThinkingItemToLastAssistant,
      replaceLastAssistantFallbackContent:
        mockReplaceLastAssistantFallbackContent,
      clearActiveThinkingItems: mockClearActiveThinkingItems,
      setActiveQuestion: mockSetActiveQuestion,
      clearActiveQuestion: mockClearActiveQuestion,
      // Activity Log state
      startContext: mockStartContext,
      endContext: mockEndContext,
      addActivityItem: mockAddActivityItem,
      contexts: [],
      currentContextId: null,
      metrics: { toolCallCount: 0 },
      conversations: {},
      activeChatId: null,
    };

    // Mock getState for direct calls
    mockGetState.mockReturnValue(state);
    (useStore as unknown as { getState: () => typeof state }).getState =
      mockGetState;

    // Mock useStore selector
    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );
  });

  describe("init message", () => {
    it("should handle init message", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "init",
              payload: {
                mode: "ask",
                model: "claude-sonnet-4-6",
                isExecuting: false,
              },
            },
          }),
        );
      });

      expect(mockSetMode).toHaveBeenCalledWith("ask");
      expect(mockSetModel).toHaveBeenCalledWith("claude-sonnet-4-6");
      expect(mockSetExecuting).toHaveBeenCalledWith(false);
    });
  });

  describe("mode_changed message", () => {
    it("should sync mode after extension acknowledgement", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "mode_changed",
              payload: {
                mode: "agent",
              },
            },
          }),
        );
      });

      expect(mockSetMode).toHaveBeenCalledWith("agent");
    });
  });

  describe("runtime_event: iteration_start", () => {
    it("should handle iteration_start event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "iteration_start",
                  iteration: 1,
                },
              },
            },
          }),
        );
      });

      expect(mockSetIteration).toHaveBeenCalledWith(1);
      expect(mockSetExecuting).toHaveBeenCalledWith(true);
      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "iteration",
        description: "Iteration 1 started",
        status: "pending",
      });
    });
  });

  describe("runtime_event: iteration_complete", () => {
    it("should handle iteration_complete event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "iteration_complete",
                  iteration: 1,
                  hadToolCalls: true,
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "iteration",
        description: "Iteration 1 completed",
        status: "success",
        metadata: { hadToolCalls: true },
      });
    });
  });

  describe("runtime_event: token", () => {
    it("should handle token event", () => {
      vi.useFakeTimers();
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "token",
                  content: "Hello",
                },
              },
            },
          }),
        );
      });

      // Token is buffered, need to advance timers to trigger flush (50ms)
      act(() => {
        vi.advanceTimersByTime(50);
      });

      // appendStreamingToken is called with (chatId, content) after flush
      // Since activeChatId is null, createChat is called first
      expect(mockCreateChat).toHaveBeenCalledWith("Nova conversa");
      expect(mockAppendStreamingToken).toHaveBeenCalledWith(
        "test-chat-id",
        "Hello",
      );

      vi.useRealTimers();
    });
  });

  describe("runtime_event: thinking", () => {
    it("should handle thinking event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "thinking",
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "thinking",
        description: "Reasoning...",
        status: "pending",
      });
    });
  });

  describe("runtime_event: provider latency", () => {
    it("should add an active event when provider request starts", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "provider_request_start",
                  iteration: 1,
                  correlationId: "request-1",
                  toolCount: 2,
                  toolChoice: "required",
                  timestamp: 100,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "provider_request_start",
          title: "Waiting model",
          summary: "Provider request sent with 2 tool(s).",
        }),
      );
    });

    it("should add an active event when provider first output arrives", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "provider_first_output",
                  iteration: 1,
                  correlationId: "request-1",
                  outputKind: "tool_call",
                  latency: 1200,
                  timestamp: 1300,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "provider_first_output",
          title: "Model first output",
          summary: "First tool_call after 1200ms.",
          durationMs: 1200,
        }),
      );
    });

    it("should add an active event when provider request ends", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "provider_request_end",
                  iteration: 1,
                  correlationId: "request-1",
                  duration: 23100,
                  stopReason: "end_turn",
                  tokenCount: 34,
                  hadToolCalls: false,
                  timestamp: 23200,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "provider_request_end",
          title: "Model response completed",
          summary: "Provider finished in 23100ms with 34 token(s).",
          durationMs: 23100,
        }),
      );
    });
  });

  describe("runtime_event: response buffering", () => {
    it("should add an active event when response buffering starts", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "response_buffer_start",
                  reason: "workspace_evidence_validation",
                  timestamp: 400,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "response_buffer_start",
          title: "Buffering response",
          summary: "Response is being held for workspace evidence validation.",
        }),
      );
    });

    it("should add an active event when response buffering flushes", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "response_buffer_flush",
                  reason: "validated",
                  duration: 900,
                  responseLength: 128,
                  timestamp: 1300,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "response_buffer_flush",
          title: "Buffered response released",
          summary: "Response buffer validated after 900ms.",
          durationMs: 900,
        }),
      );
    });
  });

  describe("runtime_event: thinking_step", () => {
    it("should add safe thinking item", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "thinking_step",
                  item: {
                    id: "think-1",
                    stage: "analyzing_request",
                    title: "Analyzing request",
                    summary: "answer task, low risk",
                    status: "success",
                    timestamp: 123,
                  },
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          id: "think-1",
          title: "Analyzing request",
          summary: "answer task, low risk",
        }),
      );
    });
  });

  describe("runtime_event: user_question", () => {
    it("should render a single active question panel without adding a duplicate chat message", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "user_question",
                  questionId: "question-1",
                  title: "Permission",
                  question: "Allow Korix to execute FileChunks?",
                  mode: "single",
                  options: [
                    {
                      value: "once",
                      label: "Approve once",
                      description: "Allow this execution only.",
                    },
                  ],
                  timeoutMs: 60000,
                  defaultAnswer: "reject",
                  timestamp: 123,
                },
              },
            },
          }),
        );
      });

      expect(mockSetActiveQuestion).toHaveBeenCalledWith({
        questionId: "question-1",
        title: "Permission",
        question: "Allow Korix to execute FileChunks?",
        mode: "single",
        options: [
          {
            value: "once",
            label: "Approve once",
            description: "Allow this execution only.",
          },
        ],
        timeoutMs: 60000,
        defaultAnswer: "reject",
      });
      expect(mockAddMessage).not.toHaveBeenCalled();
    });
  });

  describe("runtime_event: tool_call", () => {
    it("should handle tool_call event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "tool_call",
                  name: "ReadFile",
                  input: { path: "test.ts" },
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "tool",
        description: "Read test.ts",
        status: "pending",
        metadata: {
          displayAction: "Read",
          displayLabel: "Read test.ts",
          input: { path: "test.ts" },
          targetLabel: "test.ts",
          toolCallId: undefined,
          toolName: "ReadFile",
        },
      });
      expect(mockUpdateMetrics).toHaveBeenCalled();
      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "tool_call",
          title: "Read test.ts",
          summary: "Tool execution requested by the agent loop.",
        }),
      );
    });
  });

  describe("runtime_event: tool_result", () => {
    it("should handle tool_result event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "tool_result",
                  name: "ReadFile",
                  success: true, // ADDED: event.success is required
                  duration: 100,
                  id: "test-tool-id",
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "tool",
        description: "Tool ReadFile completed",
        status: "success",
        metadata: { toolName: "ReadFile" },
      });
    });

    it("should summarize batch workspace evidence collection results", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "tool_result",
                  id: "workspace-evidence-1",
                  name: "CollectWorkspaceEvidence",
                  success: true,
                  duration: 12,
                  result: {
                    files: [{ path: "src/a.ts" }],
                    omittedFiles: [{ path: "src/b.ts", reason: "max_files" }],
                  },
                  timestamp: 100,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "tool_result",
          title: "CollectWorkspaceEvidence completed",
          summary: "Collected 1 file(s), omitted 1 file(s).",
          metadata: expect.objectContaining({
            fileCount: 1,
            omittedCount: 1,
          }),
        }),
      );
    });
  });

  describe("runtime_event: tool_approved", () => {
    it("should show approval wait duration", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "tool_approved",
                  id: "tool-call-1",
                  name: "ReadFile",
                  duration: 2500,
                  timestamp: 3000,
                },
              },
            },
          }),
        );
      });

      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "tool_approved",
          title: "Tool approved: ReadFile",
          summary: "User approved tool execution after 2500ms.",
          durationMs: 2500,
        }),
      );
    });
  });

  describe("runtime_event: done", () => {
    it("should handle done event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "done",
                },
              },
            },
          }),
        );
      });

      // Should create emergency chat when activeChatId is null
      expect(mockCreateChat).toHaveBeenCalledWith("Nova conversa");
      // Should call finalizeStreaming with emergency chat ID
      expect(mockFinalizeStreaming).toHaveBeenCalledWith("test-chat-id");
      expect(mockClearActiveThinkingItems).toHaveBeenCalledWith("test-chat-id");
      // Should add system message explaining emergency chat
      expect(mockAddMessage).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("⚠️ Chat criado automaticamente"),
        }),
      );
      expect(mockSetExecuting).toHaveBeenCalledWith(false);
    });
  });

  describe("runtime_event: execution_complete", () => {
    it("should append completion event to the finalized assistant message", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "done",
                },
              },
            },
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "execution_complete",
                  success: true,
                  iterations: 2,
                  metrics: {
                    totalToolCalls: 3,
                    totalTokens: 128,
                    duration: 456,
                  },
                  timestamp: 789,
                },
              },
            },
          }),
        );
      });

      expect(mockAppendThinkingItemToLastAssistant).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "execution_complete",
          title: "Execution completed",
          summary: "2 iteration(s), 3 tool call(s), 128 token(s).",
        }),
      );
      expect(mockReplaceLastAssistantFallbackContent).toHaveBeenCalledWith(
        "test-chat-id",
        "Concluído: 2 iterações, 3 ferramentas, 128 tokens em 0.5s.",
      );
    });

    it("should append latency summary when execution metrics include latency", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "done",
                },
              },
            },
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "execution_complete",
                  success: true,
                  iterations: 2,
                  metrics: {
                    totalToolCalls: 3,
                    totalTokens: 128,
                    duration: 456,
                    latency: {
                      providerDurationMs: 340,
                      providerFirstOutputLatencyMs: 90,
                      toolDurationMs: 20,
                      approvalWaitMs: 40,
                      responseBufferDurationMs: 50,
                      iterationOverheadMs: 6,
                    },
                  },
                  timestamp: 789,
                },
              },
            },
          }),
        );
      });

      expect(mockAppendThinkingItemToLastAssistant).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "latency_summary",
          title: "Latency summary",
          summary:
            "Model 340ms, first output 90ms, tools 20ms, approvals 40ms, buffering 50ms, overhead 6ms.",
        }),
      );
    });
  });

  describe("runtime_event: error", () => {
    it("should handle error event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "error",
                  error: "Test error message",
                },
              },
            },
          }),
        );
      });

      // finalizeStreaming only called if activeChatId exists (currently null in mock)
      expect(mockFinalizeStreaming).not.toHaveBeenCalled();
      expect(mockSetExecuting).toHaveBeenCalledWith(false);
      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "error",
        description: "Test error message",
        status: "error",
        metadata: { error: "Test error message" },
      });
    });
  });

  describe("runtime_event: checkpoint_created", () => {
    it("should handle checkpoint_created event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "checkpoint_created",
                  checkpointId: "checkpoint-123",
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "checkpoint",
        description: "Checkpoint created",
        status: "success",
        metadata: { checkpointId: "checkpoint-123" },
      });
    });
  });

  describe("runtime_event: checkpoint_restored", () => {
    it("should handle checkpoint_restored event", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "runtime_event",
              payload: {
                event: {
                  type: "checkpoint_restored",
                  checkpointId: "checkpoint-456",
                },
              },
            },
          }),
        );
      });

      expect(mockAddTimelineEvent).toHaveBeenCalledWith({
        type: "checkpoint",
        description: "Checkpoint restored",
        status: "success",
        metadata: { checkpointId: "checkpoint-456" },
      });
    });
  });

  describe("terminal messages", () => {
    it("should handle terminal_session_created message", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "terminal_session_created",
              payload: {
                sessionId: "session-1",
                shellPath: "/bin/bash",
              },
            },
          }),
        );
      });

      expect(mockCreateSession).toHaveBeenCalledWith("session-1", "/bin/bash");
    });

    it("should handle terminal_output message", () => {
      renderHook(() => useRuntimeEvents());

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "terminal_output",
              payload: {
                sessionId: "session-1",
                data: "ls\n",
              },
            },
          }),
        );
      });

      expect(mockAppendOutput).toHaveBeenCalledWith("session-1", "ls\n");
    });
  });

  describe("cleanup", () => {
    it("should remove event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useRuntimeEvents());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
    });
  });
});
