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
        description: "Tool: ReadFile",
        status: "pending",
        metadata: { toolName: "ReadFile", input: { path: "test.ts" } },
      });
      expect(mockUpdateMetrics).toHaveBeenCalled();
      expect(mockAddActiveThinkingItem).toHaveBeenCalledWith(
        "test-chat-id",
        expect.objectContaining({
          stage: "tool_call",
          title: "Calling ReadFile",
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
