/**
 * useVSCode hook tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVSCode } from "./useVSCode";

// Mock VSCode API
const mockPostMessage = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();

describe("useVSCode", () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    mockGetState.mockClear();
    mockSetState.mockClear();

    // Mock global acquireVsCodeApi
    (
      global as unknown as { acquireVsCodeApi: () => unknown }
    ).acquireVsCodeApi = () => ({
      postMessage: mockPostMessage,
      getState: mockGetState,
      setState: mockSetState,
    });
  });

  afterEach(() => {
    // Reset the cached API in the module
    vi.resetModules();
  });

  it("should return sendMessage function", () => {
    const { result } = renderHook(() => useVSCode());

    expect(result.current).toBeDefined();
    expect(result.current.sendMessage).toBeTypeOf("function");
  });

  it("should call postMessage with correct payload", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "send_message",
      payload: { content: "test message", mode: "agent" },
    });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "send_message",
      payload: { content: "test message", mode: "agent" },
    });
  });

  it("should support change_mode message", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "change_mode",
      payload: { mode: "agent" },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "change_mode",
      payload: { mode: "agent" },
    });
  });

  it("should support approve_tool message", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "approve_tool",
      payload: { toolCallId: "tool-1", approval: "once" },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "approve_tool",
      payload: { toolCallId: "tool-1", approval: "once" },
    });
  });

  it("should support terminal_input message", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "terminal_input",
      payload: { sessionId: "session-1", data: "ls\n" },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "terminal_input",
      payload: { sessionId: "session-1", data: "ls\n" },
    });
  });

  it("should support create_terminal message", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "create_terminal",
      payload: { shellPath: "/bin/bash" },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "create_terminal",
      payload: { shellPath: "/bin/bash" },
    });
  });

  it("should support restore_checkpoint message", () => {
    const { result } = renderHook(() => useVSCode());

    result.current.sendMessage({
      type: "restore_checkpoint",
      payload: { checkpointId: "checkpoint-123" },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "restore_checkpoint",
      payload: { checkpointId: "checkpoint-123" },
    });
  });

  it("should be stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useVSCode());

    const firstSendMessage = result.current.sendMessage;
    rerender();
    const secondSendMessage = result.current.sendMessage;

    expect(firstSendMessage).toBe(secondSendMessage);
  });
});
