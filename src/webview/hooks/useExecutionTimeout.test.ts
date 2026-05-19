/**
 * useExecutionTimeout hook tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useExecutionTimeout } from "./useExecutionTimeout";
import { useStore } from "../store";

// Mock store
const mockGetState = vi.fn();
const mockSetExecuting = vi.fn();

vi.mock("../store", () => ({
  useStore: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("useExecutionTimeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const state = {
      isExecuting: false,
      setExecuting: mockSetExecuting,
    };

    mockGetState.mockReturnValue(state);
    (useStore as unknown as { getState: () => typeof state }).getState =
      mockGetState;

    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not create timeout when isExecuting is false", () => {
    renderHook(() => useExecutionTimeout());

    vi.advanceTimersByTime(120_000);

    expect(mockSetExecuting).not.toHaveBeenCalled();
  });

  it("should force isExecuting=false after 120s timeout", () => {
    // Set isExecuting to true
    const state = {
      isExecuting: true,
      setExecuting: mockSetExecuting,
    };

    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );

    renderHook(() => useExecutionTimeout());

    // Fast-forward 120 seconds
    vi.advanceTimersByTime(120_000);

    expect(mockSetExecuting).toHaveBeenCalledWith(false);
  });

  it("should clear timeout when isExecuting becomes false", () => {
    let state = {
      isExecuting: true,
      setExecuting: mockSetExecuting,
    };

    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );

    const { rerender } = renderHook(() => useExecutionTimeout());

    // Change state to isExecuting: false
    state = {
      isExecuting: false,
      setExecuting: mockSetExecuting,
    };

    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );

    rerender();

    // Timeout should be cleared, so advancing time should not call setExecuting
    vi.advanceTimersByTime(120_000);

    expect(mockSetExecuting).not.toHaveBeenCalled();
  });

  it("should cleanup timeout on unmount", () => {
    const state = {
      isExecuting: true,
      setExecuting: mockSetExecuting,
    };

    (useStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector) => {
        return selector(state);
      },
    );

    const { unmount } = renderHook(() => useExecutionTimeout());

    unmount();

    // After unmount, timeout should be cleared
    vi.advanceTimersByTime(120_000);

    expect(mockSetExecuting).not.toHaveBeenCalled();
  });
});
