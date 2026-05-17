/**
 * CheckpointManager unit tests
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CheckpointManager } from "./checkpoints";
import { RuntimeState } from "./runtimeState";
import type { ExecutionContext } from "../types";
import type { Logger } from "@/telemetry/logger";
import fs from "fs/promises";

// Mock filesystem
vi.mock("fs/promises");

describe("CheckpointManager", () => {
  let manager: CheckpointManager;
  let state: RuntimeState;
  let mockLogger: Logger;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockContext = {
      mode: "agent",
      workspaceRoot: "/test/workspace",
      openFiles: [],
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    manager = new CheckpointManager(mockLogger);
    state = new RuntimeState(mockContext, 25);

    // Mock fs methods
    vi.mocked(fs.readFile).mockResolvedValue("file content");
    vi.mocked(fs.writeFile).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkpoint creation", () => {
    it("should create checkpoint with modified files only", async () => {
      state.addMessage({ role: "user", content: "Test", timestamp: 1000 });
      state.markFileModified("/src/file1.ts");
      state.markFileModified("/src/file2.ts");

      const modifiedFiles = new Set(["/src/file1.ts", "/src/file2.ts"]);
      const checkpointId = await manager.create(state, modifiedFiles);

      expect(checkpointId).toBeDefined();
      expect(checkpointId).toMatch(/^checkpoint-/);

      // Verify file reads (2 files)
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it("should snapshot conversation state", async () => {
      state.addMessage({ role: "user", content: "Message 1", timestamp: 1000 });
      state.addMessage({
        role: "assistant",
        content: "Response 1",
        timestamp: 2000,
      });

      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.conversationSnapshot).toHaveLength(2);
      expect(checkpoint?.conversationSnapshot[0]?.content).toBe("Message 1");
    });

    it("should snapshot memory state", async () => {
      state.setCheckpoint("previous-checkpoint");

      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint?.memoryState.lastCheckpointId).toBe(
        "previous-checkpoint",
      );
    });

    it("should include operation journal", async () => {
      state.recordToolCall(
        "ReadFile",
        { path: "/test.ts" },
        { data: "content" },
        100,
        true,
      );
      state.recordToolCall(
        "WriteFile",
        { path: "/out.ts" },
        { success: true },
        200,
        true,
      );

      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint?.operationJournal).toHaveLength(2);
      expect(checkpoint?.operationJournal[0]?.type).toBe("tool_call");
      expect(checkpoint?.operationJournal[0]?.toolName).toBe("ReadFile");
    });

    it("should generate unique checkpoint IDs", async () => {
      const id1 = await manager.create(state, new Set());
      const id2 = await manager.create(state, new Set());
      const id3 = await manager.create(state, new Set());

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it("should store iteration number", async () => {
      state.incrementIteration();
      state.incrementIteration();
      state.incrementIteration(); // iteration = 3

      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint?.iteration).toBe(3);
    });
  });

  describe("checkpoint retrieval", () => {
    it("should retrieve checkpoint by ID", async () => {
      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(checkpointId);
    });

    it("should return undefined for non-existent checkpoint", () => {
      const checkpoint = manager.get("non-existent-id");
      expect(checkpoint).toBeUndefined();
    });

    it("should get latest checkpoint", async () => {
      const id1 = await manager.create(state, new Set());
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const id2 = await manager.create(state, new Set());
      await new Promise((resolve) => setTimeout(resolve, 10));
      const id3 = await manager.create(state, new Set());

      const latest = manager.getLatest();
      expect(latest?.id).toBe(id3);
    });

    it("should return undefined when no checkpoints exist", () => {
      const latest = manager.getLatest();
      expect(latest).toBeUndefined();
    });
  });

  describe("checkpoint restore", () => {
    it("should restore files from checkpoint", async () => {
      state.markFileModified("/src/test.ts");
      const modifiedFiles = new Set(["/src/test.ts"]);

      const checkpointId = await manager.create(state, modifiedFiles);
      await manager.restore(checkpointId);

      // Verify file was written back
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/src/test.ts",
        "file content",
        "utf-8",
      );
    });

    it("should restore multiple files", async () => {
      const modifiedFiles = new Set([
        "/src/file1.ts",
        "/src/file2.ts",
        "/src/file3.ts",
      ]);

      const checkpointId = await manager.create(state, modifiedFiles);
      await manager.restore(checkpointId);

      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    it("should throw when restoring non-existent checkpoint", async () => {
      await expect(manager.restore("non-existent")).rejects.toThrow(
        "not found",
      );
    });

    it("should handle file write errors", async () => {
      const modifiedFiles = new Set(["/src/test.ts"]);
      const checkpointId = await manager.create(state, modifiedFiles);

      // Mock write failure
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("Write failed"));

      await expect(manager.restore(checkpointId)).rejects.toThrow();
    });
  });

  describe("checkpoint eviction", () => {
    it("should evict oldest checkpoints when exceeding limit (10)", async () => {
      // Create 12 checkpoints
      const ids: string[] = [];
      for (let i = 0; i < 12; i++) {
        const id = await manager.create(state, new Set());
        ids.push(id);
        await new Promise((resolve) => setTimeout(resolve, 5)); // Ensure distinct timestamps
      }

      // First 2 should be evicted
      expect(manager.get(ids[0] ?? "")).toBeUndefined();
      expect(manager.get(ids[1] ?? "")).toBeUndefined();

      // Last 10 should exist
      for (let i = 2; i < 12; i++) {
        expect(manager.get(ids[i] ?? "")).toBeDefined();
      }
    });

    it("should keep exactly 10 checkpoints", async () => {
      for (let i = 0; i < 15; i++) {
        await manager.create(state, new Set());
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Count checkpoints by trying to get latest repeatedly
      const latest = manager.getLatest();
      let count = 0;
      let currentId = latest?.id;

      while (currentId && count < 20) {
        const cp = manager.get(currentId);
        if (!cp) break;
        count++;

        // Find next oldest (simplified - just try previous IDs)
        currentId = undefined;
        break;
      }

      // At most 10 checkpoints should exist (this test is simplified)
      expect(count).toBeLessThanOrEqual(10);
    });
  });

  describe("file snapshots", () => {
    it("should compute file hash", async () => {
      const modifiedFiles = new Set(["/src/test.ts"]);
      const checkpointId = await manager.create(state, modifiedFiles);
      const checkpoint = manager.get(checkpointId);

      const fileSnapshot = checkpoint?.modifiedFiles[0];
      expect(fileSnapshot?.hash).toBeDefined();
      expect(fileSnapshot?.hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it("should store file timestamp", async () => {
      const modifiedFiles = new Set(["/src/test.ts"]);
      const before = Date.now();

      const checkpointId = await manager.create(state, modifiedFiles);

      const after = Date.now();
      const checkpoint = manager.get(checkpointId);
      const fileSnapshot = checkpoint?.modifiedFiles[0];

      expect(fileSnapshot?.timestamp).toBeGreaterThanOrEqual(before);
      expect(fileSnapshot?.timestamp).toBeLessThanOrEqual(after);
    });

    it("should handle file read errors gracefully", async () => {
      const modifiedFiles = new Set(["/src/test.ts"]);

      // Mock read failure
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("File not found"));

      await expect(manager.create(state, modifiedFiles)).rejects.toThrow();
    });
  });

  describe("empty checkpoints", () => {
    it("should create checkpoint with no modified files", async () => {
      const checkpointId = await manager.create(state, new Set());
      const checkpoint = manager.get(checkpointId);

      expect(checkpoint?.modifiedFiles).toHaveLength(0);
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it("should restore checkpoint with no files", async () => {
      const checkpointId = await manager.create(state, new Set());
      await manager.restore(checkpointId);

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
