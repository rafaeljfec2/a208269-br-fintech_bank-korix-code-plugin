/**
 * RuntimeState unit tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RuntimeState } from "./runtimeState";
import type { Message, ExecutionContext } from "../types";

describe("RuntimeState", () => {
  let state: RuntimeState;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {
      mode: "agent",
      workspaceRoot: "/test/workspace",
      openFiles: [],
    };
    state = new RuntimeState(mockContext, 25);
  });

  describe("initialization", () => {
    it("should initialize with empty conversation", () => {
      const conversation = state.getConversation();
      expect(conversation.messages).toHaveLength(0);
      expect(conversation.turnCount).toBe(0);
      expect(conversation.toolCallHistory).toHaveLength(0);
    });

    it("should initialize execution state at iteration 0", () => {
      const execution = state.getExecution();
      expect(execution.currentIteration).toBe(0);
      expect(execution.maxIterations).toBe(25);
      expect(execution.isExecuting).toBe(false);
    });

    it("should initialize workspace state with context root", () => {
      const workspace = state.getWorkspace();
      expect(workspace.root).toBe("/test/workspace");
      expect(workspace.modifiedFiles.size).toBe(0);
      expect(workspace.openFiles).toHaveLength(0);
    });

    it("should initialize memory state", () => {
      const memory = state.getMemory();
      expect(memory.shortTerm.size).toBe(0);
      expect(memory.conversationContext).toHaveLength(0);
      expect(memory.lastCheckpointId).toBeUndefined();
    });
  });

  describe("message management", () => {
    it("should add user message", () => {
      const message: Message = {
        role: "user",
        content: "Test message",
        timestamp: Date.now(),
      };

      state.addMessage(message);
      const conversation = state.getConversation();

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toEqual(message);
      expect(conversation.turnCount).toBe(1);
    });

    it("should add assistant message", () => {
      const message: Message = {
        role: "assistant",
        content: "Response",
        timestamp: Date.now(),
      };

      state.addMessage(message);
      const conversation = state.getConversation();

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toEqual(message);
    });

    it("should add tool message", () => {
      const message: Message = {
        role: "tool",
        content: '{"result": "success"}',
        toolCallId: "call-123",
        timestamp: Date.now(),
      };

      state.addMessage(message);
      const conversation = state.getConversation();

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toEqual(message);
    });

    it("should maintain message order", () => {
      const msg1: Message = { role: "user", content: "First", timestamp: 1000 };
      const msg2: Message = {
        role: "assistant",
        content: "Second",
        timestamp: 2000,
      };
      const msg3: Message = { role: "user", content: "Third", timestamp: 3000 };

      state.addMessage(msg1);
      state.addMessage(msg2);
      state.addMessage(msg3);

      const messages = state.getConversation().messages;
      expect(messages).toHaveLength(3);
      expect(messages[0]?.content).toBe("First");
      expect(messages[1]?.content).toBe("Second");
      expect(messages[2]?.content).toBe("Third");
    });
  });

  describe("tool call recording", () => {
    it("should record tool call with metadata", () => {
      state.recordToolCall(
        "ReadFile",
        { path: "/test.ts" },
        { success: true, data: "content" },
        123,
        true,
      );

      const conversation = state.getConversation();
      expect(conversation.toolCallHistory).toHaveLength(1);

      const record = conversation.toolCallHistory[0];
      expect(record).toBeDefined();
      expect(record?.toolName).toBe("ReadFile");
      expect(record?.success).toBe(true);
      expect(record?.duration).toBe(123);
    });

    it("should record multiple tool calls", () => {
      state.recordToolCall(
        "ReadFile",
        { path: "/a.ts" },
        { success: true },
        100,
        true,
      );
      state.recordToolCall(
        "WriteFile",
        { path: "/b.ts" },
        { success: true },
        200,
        true,
      );
      state.recordToolCall(
        "RunCommand",
        { cmd: "ls" },
        { success: false, error: "failed" },
        50,
        false,
      );

      const history = state.getConversation().toolCallHistory;
      expect(history).toHaveLength(3);
      expect(history[0]?.toolName).toBe("ReadFile");
      expect(history[1]?.toolName).toBe("WriteFile");
      expect(history[2]?.toolName).toBe("RunCommand");
      expect(history[2]?.success).toBe(false);
    });
  });

  describe("iteration management", () => {
    it("should increment iteration counter", () => {
      expect(state.getExecution().currentIteration).toBe(0);

      state.incrementIteration();
      expect(state.getExecution().currentIteration).toBe(1);

      state.incrementIteration();
      expect(state.getExecution().currentIteration).toBe(2);
    });

    it("should update lastActivityTime on increment", () => {
      const before = state.getExecution().lastActivityTime;

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait
      }

      state.incrementIteration();
      const after = state.getExecution().lastActivityTime;

      expect(after).toBeGreaterThan(before);
    });

    it("should set execution flag", () => {
      expect(state.getExecution().isExecuting).toBe(false);

      state.startExecution();
      expect(state.getExecution().isExecuting).toBe(true);

      state.stopExecution();
      expect(state.getExecution().isExecuting).toBe(false);
    });
  });

  describe("file modification tracking", () => {
    it("should mark file as modified", () => {
      state.markFileModified("/src/index.ts");

      const workspace = state.getWorkspace();
      expect(workspace.modifiedFiles.has("/src/index.ts")).toBe(true);
      expect(workspace.modifiedFiles.size).toBe(1);
    });

    it("should track multiple modified files", () => {
      state.markFileModified("/src/a.ts");
      state.markFileModified("/src/b.ts");
      state.markFileModified("/src/c.ts");

      const workspace = state.getWorkspace();
      expect(workspace.modifiedFiles.size).toBe(3);
      expect(workspace.modifiedFiles.has("/src/a.ts")).toBe(true);
      expect(workspace.modifiedFiles.has("/src/b.ts")).toBe(true);
      expect(workspace.modifiedFiles.has("/src/c.ts")).toBe(true);
    });

    it("should not duplicate file modifications", () => {
      state.markFileModified("/src/index.ts");
      state.markFileModified("/src/index.ts");
      state.markFileModified("/src/index.ts");

      const workspace = state.getWorkspace();
      expect(workspace.modifiedFiles.size).toBe(1);
    });
  });

  describe("checkpoint management", () => {
    it("should set checkpoint ID", () => {
      expect(state.getMemory().lastCheckpointId).toBeUndefined();

      state.setCheckpoint("checkpoint-123");
      expect(state.getMemory().lastCheckpointId).toBe("checkpoint-123");
    });

    it("should update checkpoint ID", () => {
      state.setCheckpoint("checkpoint-1");
      state.setCheckpoint("checkpoint-2");

      expect(state.getMemory().lastCheckpointId).toBe("checkpoint-2");
    });
  });

  describe("snapshot and restore", () => {
    it("should create immutable snapshot", () => {
      state.addMessage({ role: "user", content: "Test", timestamp: 1000 });
      state.markFileModified("/src/test.ts");
      state.incrementIteration();
      state.setCheckpoint("chk-1");

      const snapshot = state.createSnapshot();

      expect(snapshot.conversation.messages).toHaveLength(1);
      expect(snapshot.execution.currentIteration).toBe(1);
      expect(snapshot.workspace.modifiedFiles.has("/src/test.ts")).toBe(true);
      expect(snapshot.memory.lastCheckpointId).toBe("chk-1");
      expect(snapshot.correlationId).toBeDefined();
    });

    it("should restore from snapshot", () => {
      // Create initial state
      state.addMessage({ role: "user", content: "Original", timestamp: 1000 });
      state.incrementIteration();
      state.markFileModified("/original.ts");
      const snapshot = state.createSnapshot();

      // Modify state
      state.addMessage({
        role: "assistant",
        content: "Modified",
        timestamp: 2000,
      });
      state.incrementIteration();
      state.markFileModified("/modified.ts");

      // Verify modified
      expect(state.getConversation().messages).toHaveLength(2);
      expect(state.getExecution().currentIteration).toBe(2);

      // Restore
      state.restoreSnapshot(snapshot);

      // Verify restored
      expect(state.getConversation().messages).toHaveLength(1);
      expect(state.getConversation().messages[0]?.content).toBe("Original");
      expect(state.getExecution().currentIteration).toBe(1);
      expect(state.getWorkspace().modifiedFiles.has("/original.ts")).toBe(true);
      expect(state.getWorkspace().modifiedFiles.has("/modified.ts")).toBe(
        false,
      );
    });

    it("should create deep copies in snapshot", () => {
      state.addMessage({ role: "user", content: "Test", timestamp: 1000 });
      const snapshot = state.createSnapshot();

      // Modify original after snapshot
      state.addMessage({
        role: "assistant",
        content: "After",
        timestamp: 2000,
      });

      // Snapshot should be unchanged
      expect(snapshot.conversation.messages).toHaveLength(1);
      expect(state.getConversation().messages).toHaveLength(2);
    });

    it("should serialize to a JSON-safe snapshot", () => {
      state.addMessage({ role: "user", content: "Serialize", timestamp: 1000 });
      state.recordToolCall(
        "ReadFile",
        { path: "/test.ts" },
        { data: "content" },
        12,
        true,
      );
      state.updateTodos([
        {
          content: "Check serialization",
          status: "in_progress",
          activeForm: "Checking serialization",
        },
      ]);
      state.markFileModified("/src/runtime.ts");
      state.setCheckpoint("chk-serialize");

      const serialized = state.serialize();
      const reparsed = JSON.parse(JSON.stringify(serialized));

      expect(Array.isArray(reparsed.workspace.modifiedFiles)).toBe(true);
      expect(reparsed.workspace.modifiedFiles).toEqual(["/src/runtime.ts"]);
      expect(Array.isArray(reparsed.memory.shortTerm)).toBe(true);
      expect(reparsed.memory.lastCheckpointId).toBe("chk-serialize");
      expect(reparsed.conversation.todos).toHaveLength(1);
      expect(reparsed.conversation.toolCallHistory).toHaveLength(1);
    });

    it("should deserialize a serialized runtime state", () => {
      state.addMessage({ role: "user", content: "Original", timestamp: 1000 });
      state.incrementIteration();
      state.markFileModified("/src/original.ts");
      state.updateTodos([
        {
          content: "Restore state",
          status: "completed",
          activeForm: "Restoring state",
        },
      ]);

      const restored = RuntimeState.deserialize(state.serialize());

      expect(restored.getConversation().messages[0]?.content).toBe("Original");
      expect(restored.getConversation().todos[0]?.content).toBe(
        "Restore state",
      );
      expect(restored.getExecution().currentIteration).toBe(1);
      expect(
        restored.getWorkspace().modifiedFiles.has("/src/original.ts"),
      ).toBe(true);
      expect(restored.getCorrelationId()).toBe(state.getCorrelationId());
    });
  });

  describe("immutability", () => {
    it("should return readonly conversation snapshot", () => {
      state.addMessage({ role: "user", content: "Test", timestamp: 1000 });
      const conversation1 = state.getConversation();

      // Add another message
      state.addMessage({
        role: "assistant",
        content: "Response",
        timestamp: 2000,
      });
      const conversation2 = state.getConversation();

      // Snapshots are independent
      expect(conversation1.messages).toHaveLength(1);
      expect(conversation2.messages).toHaveLength(2);
    });

    it("should return readonly workspace snapshot", () => {
      state.markFileModified("/file1.ts");
      const workspace1 = state.getWorkspace();

      state.markFileModified("/file2.ts");
      const workspace2 = state.getWorkspace();

      // Snapshots are independent
      expect(workspace1.modifiedFiles.size).toBe(1);
      expect(workspace2.modifiedFiles.size).toBe(2);
    });
  });
});
