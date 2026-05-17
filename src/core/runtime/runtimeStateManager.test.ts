/**
 * RuntimeStateManager tests - lifecycle, state transitions, concurrency guards
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeStateManager } from "./runtimeStateManager";
import type { ExecutionContext, Message } from "../types";

describe("RuntimeStateManager", () => {
  let manager: RuntimeStateManager;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    manager = new RuntimeStateManager();
    mockContext = {
      mode: "ask",
      workspaceRoot: "/test/workspace",
      openFiles: [],
    };
  });

  describe("initialization lifecycle", () => {
    it("should start uninitialized", () => {
      expect(manager.isInitialized()).toBe(false);
    });

    it("should initialize with context and default maxIterations", () => {
      manager.initialize(mockContext);

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getMode()).toBe("ask");
      expect(manager.getSessionId()).not.toBeNull();
      expect(manager.isExecuting()).toBe(false);
    });

    it("should initialize with custom maxIterations", () => {
      manager.initialize(mockContext, 50);

      expect(manager.isInitialized()).toBe(true);
    });

    it("should set mode from ExecutionContext", () => {
      mockContext.mode = "agent";
      manager.initialize(mockContext);

      expect(manager.getMode()).toBe("agent");
    });

    it("should generate unique sessionId on each initialization", () => {
      manager.initialize(mockContext);
      const sessionId1 = manager.getSessionId();

      manager.reset();
      manager.initialize(mockContext);
      const sessionId2 = manager.getSessionId();

      expect(sessionId1).not.toBeNull();
      expect(sessionId2).not.toBeNull();
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe("reset", () => {
    it("should clear state and become uninitialized", () => {
      manager.initialize(mockContext);
      expect(manager.isInitialized()).toBe(true);

      manager.reset();

      expect(manager.isInitialized()).toBe(false);
      expect(manager.getSessionId()).toBeNull();
    });

    it("should allow re-initialization after reset", () => {
      manager.initialize(mockContext);
      manager.reset();
      manager.initialize(mockContext);

      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe("concurrency guard", () => {
    it("should throw when initialize called during active execution", () => {
      manager.initialize(mockContext);
      manager.startExecution();

      expect(() => {
        manager.initialize(mockContext);
      }).toThrow("Cannot initialize RuntimeState while execution is active");
    });

    it("should allow re-initialization after execution stops", () => {
      manager.initialize(mockContext);
      manager.startExecution();
      manager.stopExecution();

      expect(() => {
        manager.initialize(mockContext);
      }).not.toThrow();
    });
  });

  describe("mode management", () => {
    it("should get and set mode", () => {
      manager.initialize(mockContext);

      manager.setMode("plan");
      expect(manager.getMode()).toBe("plan");

      manager.setMode("agent");
      expect(manager.getMode()).toBe("agent");
    });

    it("should preserve mode across execution lifecycle", () => {
      manager.initialize(mockContext);
      manager.setMode("agent");
      manager.startExecution();

      expect(manager.getMode()).toBe("agent");

      manager.stopExecution();
      expect(manager.getMode()).toBe("agent");
    });
  });

  describe("execution state", () => {
    it("should start not executing", () => {
      manager.initialize(mockContext);
      expect(manager.isExecuting()).toBe(false);
    });

    it("should transition to executing when started", () => {
      manager.initialize(mockContext);
      manager.startExecution();

      expect(manager.isExecuting()).toBe(true);
    });

    it("should transition to not executing when stopped", () => {
      manager.initialize(mockContext);
      manager.startExecution();
      manager.stopExecution();

      expect(manager.isExecuting()).toBe(false);
    });

    it("should handle stopExecution when uninitialized", () => {
      expect(() => {
        manager.stopExecution();
      }).not.toThrow();
    });

    it("should return false for isExecuting when uninitialized", () => {
      expect(manager.isExecuting()).toBe(false);
    });
  });

  describe("iteration tracking", () => {
    it("should start at iteration 0", () => {
      manager.initialize(mockContext);
      expect(manager.getCurrentIteration()).toBe(0);
    });

    it("should return 0 when uninitialized", () => {
      expect(manager.getCurrentIteration()).toBe(0);
    });
  });

  describe("message management", () => {
    it("should start with empty messages", () => {
      manager.initialize(mockContext);
      expect(manager.getMessages()).toHaveLength(0);
    });

    it("should return empty array when uninitialized", () => {
      expect(manager.getMessages()).toEqual([]);
    });

    it("should add message to conversation", () => {
      manager.initialize(mockContext);

      const message: Message = {
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      };

      manager.addMessage(message);

      const messages = manager.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
    });

    it("should throw when adding message without initialization", () => {
      const message: Message = {
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      };

      expect(() => {
        manager.addMessage(message);
      }).toThrow("RuntimeState not initialized");
    });
  });

  describe("snapshot and restore", () => {
    it("should create snapshot of current state", () => {
      manager.initialize(mockContext);
      manager.startExecution();

      const message: Message = {
        role: "user",
        content: "Test",
        timestamp: Date.now(),
      };
      manager.addMessage(message);

      const snapshot = manager.createSnapshot();

      expect(snapshot).not.toBeNull();
      expect(snapshot?.execution.isExecuting).toBe(true);
      expect(snapshot?.conversation.messages).toHaveLength(1);
    });

    it("should return null when creating snapshot without initialization", () => {
      const snapshot = manager.createSnapshot();
      expect(snapshot).toBeNull();
    });

    it("should restore state from snapshot", () => {
      manager.initialize(mockContext);

      const message: Message = {
        role: "user",
        content: "Original",
        timestamp: Date.now(),
      };
      manager.addMessage(message);
      manager.startExecution();

      const snapshot = manager.createSnapshot();

      // Modify state
      manager.stopExecution();
      const newMessage: Message = {
        role: "assistant",
        content: "New",
        timestamp: Date.now(),
      };
      manager.addMessage(newMessage);

      // Restore
      manager.restoreSnapshot(snapshot!);

      expect(manager.isExecuting()).toBe(true);
      expect(manager.getMessages()).toHaveLength(1);
      expect(manager.getMessages()[0]?.content).toBe("Original");
    });

    it("should throw when restoring snapshot without initialization", () => {
      manager.initialize(mockContext);
      const snapshot = manager.createSnapshot();
      manager.reset();

      expect(() => {
        manager.restoreSnapshot(snapshot!);
      }).toThrow("RuntimeState not initialized");
    });
  });

  describe("execution guards", () => {
    it("should throw when startExecution called without initialization", () => {
      expect(() => {
        manager.startExecution();
      }).toThrow("RuntimeState not initialized");
    });
  });
});
