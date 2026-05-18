# Testing Guide - Korix Code Tools

Comprehensive guide for writing tests for tools in the Korix Code runtime.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Using Test Factories](#using-test-factories)
- [Mocking Strategies](#mocking-strategies)
- [Testing Patterns](#testing-patterns)
- [Coverage Requirements](#coverage-requirements)
- [Running Tests](#running-tests)

---

## Overview

### Testing Philosophy

**What to test:**
- ✅ Tool behavior and outcomes (success/failure)
- ✅ Input validation (Zod schema)
- ✅ Output structure and data correctness
- ✅ Error handling and edge cases
- ✅ Performance characteristics (duration tracking)
- ✅ Caching behavior

**What NOT to test:**
- ❌ Implementation details (internal methods)
- ❌ Third-party dependencies (ripgrep, git, VSCode API)
- ❌ Tool Registry internals (tested separately)

### Test Structure

```
src/tools/
  filesystem/
    searchFiles.ts
    __tests__/
      searchFiles.test.ts         # Co-located with implementation
  git/
    gitStatus.ts
    __tests__/
      gitStatus.test.ts
  search/
    grep.ts
    __tests__/
      grep.test.ts
```

---

## Test Structure

### Standard Test Template

```typescript
/**
 * ToolName Unit Tests
 *
 * Tests:
 * - Schema validation
 * - Happy path execution
 * - Error handling
 * - Edge cases
 * - Performance and metadata
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolName } from "../toolName";
import { createMockToolContext } from "../../../__tests__/factories/toolContext.factory";
import type { ToolContext } from "../../../harness/toolRegistry";

// Mock dependencies
vi.mock("dependency-module");

describe("ToolName", () => {
  let context: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockToolContext();
  });

  describe("schema validation", () => {
    it("should reject invalid input", async () => {
      const result = await ToolName.execute(
        { invalid: "input" } as any,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid input/i);
    });

    it("should accept valid input", async () => {
      // Setup mocks for success
      const result = await ToolName.execute(
        { validInput: "value" },
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe("happy path", () => {
    it("should return expected output", async () => {
      // Arrange: setup mocks
      // Act: execute tool
      // Assert: verify output
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully", async () => {
      // Test error scenarios
    });
  });

  describe("performance", () => {
    it("should track execution duration", async () => {
      const result = await ToolName.execute(input, context);

      expect(result.metadata?.duration).toBeGreaterThan(0);
      expect(result.metadata?.timestamp).toBeGreaterThan(0);
    });
  });

  describe("allowedInMode", () => {
    it("should allow execution in expected modes", () => {
      expect(ToolName.allowedInMode?.("agent")).toBe(true);
    });
  });
});
```

---

## Using Test Factories

### ToolContext Factory

Creates mock `ToolContext` for tool execution:

```typescript
import { createMockToolContext } from "../../../__tests__/factories/toolContext.factory";

// Basic usage
const context = createMockToolContext();

// Custom workspace root
const context = createMockToolContext({
  workspaceRoot: "/custom/path"
});

// Custom execution mode
const context = createMockToolContextWithMode("interactive");
```

**Available helpers:**
- `createMockToolContext(overrides?)` - General mock
- `createMockToolContextWithMode(mode)` - Specific mode
- `createMockToolContextWithWorkspace(root)` - Custom workspace

---

### Subprocess Factory

Creates mock child processes for tools that spawn commands (ripgrep, git):

```typescript
import { createMockProcess } from "../../../__tests__/factories/subprocess.factory";

// Basic mock process
const mockProc = createMockProcess(
  0,                    // exit code
  "stdout output\n",    // stdout
  ""                    // stderr
);

// With delay for async testing
const mockProc = createMockProcessWithOptions({
  exitCode: 0,
  stdout: "output",
  delay: 100            // ms
});

// Error process
const mockProc = createMockProcessWithError("Command failed");

// Ripgrep JSON output
const mockProc = createMockRipgrepProcess([
  {
    path: "file.ts",
    line_number: 42,
    lines: { text: "const x = 1;" }
  }
]);

// Git porcelain output
const mockProc = createMockGitProcess([
  { status: "M", path: "file.ts" },
  { status: "A", path: "new.ts" }
]);
```

---

### Workspace Factory

Creates mock workspace with files:

```typescript
import { createMockWorkspace } from "../../../__tests__/factories/workspace.factory";

// Custom workspace
const workspace = createMockWorkspace({
  "src/index.ts": "export const x = 1;",
  "package.json": JSON.stringify({ name: "test" })
});

// TypeScript workspace (pre-configured)
const workspace = createMockTypeScriptWorkspace();

// Monorepo workspace
const workspace = createMockMonorepoWorkspace();

// Empty workspace
const workspace = createEmptyWorkspace();

// Use workspace methods
if (workspace.hasFile("src/index.ts")) {
  const content = workspace.getFile("src/index.ts");
}
```

---

## Mocking Strategies

### Mocking child_process (Ripgrep, Git)

```typescript
import { spawn } from "child_process";
import { vi } from "vitest";
import { createMockProcess } from "../../../__tests__/factories/subprocess.factory";

// Mock at module level
vi.mock("child_process");

describe("SearchFilesTool", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock
    const { spawn } = await import("child_process");
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(0, "file.ts\n") as ReturnType<typeof spawn>
    );
  });

  it("should search files", async () => {
    const { spawn } = await import("child_process");

    // Override for this test
    vi.mocked(spawn).mockReturnValue(
      createMockProcess(0, "file1.ts\nfile2.ts\n") as ReturnType<typeof spawn>
    );

    const result = await SearchFilesTool.execute(
      { pattern: "*.ts", searchType: "name" },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});
```

---

### Mocking VSCode API (LSP)

```typescript
import * as vscode from "vscode";
import { vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn()
  },
  Uri: {
    file: (path: string) => ({ fsPath: path })
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Location: class {
    constructor(public uri: any, public range: any) {}
  }
}));

describe("FindReferencesTool", () => {
  it("should find references via LSP", async () => {
    const mockRefs = [
      new vscode.Location(
        vscode.Uri.file("/test/file.ts"),
        new vscode.Range(10, 0, 10, 10)
      )
    ];

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockRefs);

    const result = await FindReferencesTool.execute(
      { file: "/test/file.ts", line: 5, column: 10 },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data?.references).toHaveLength(1);
  });
});
```

---

### Mocking fs/promises

```typescript
import fs from "fs/promises";
import { vi } from "vitest";

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn()
  }
}));

describe("ReadFileTool", () => {
  it("should read file content", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("file content");

    const result = await ReadFileTool.execute(
      { path: "/test/file.ts" },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("file content");
  });
});
```

---

## Testing Patterns

### Pattern 1: Schema Validation

Every tool must validate input via Zod schema:

```typescript
describe("schema validation", () => {
  it("should reject invalid type", async () => {
    const result = await tool.execute(
      { pattern: 123 } as any,  // Wrong type
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("should reject missing required field", async () => {
    const result = await tool.execute(
      {} as any,  // Missing required field
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Required/i);
  });

  it("should accept valid input with defaults", async () => {
    // Setup success mock
    const result = await tool.execute(
      { pattern: "*.ts" },  // Valid, uses defaults
      context
    );

    expect(result.success).toBe(true);
  });
});
```

---

### Pattern 2: Happy Path

Test the expected successful execution:

```typescript
describe("happy path", () => {
  it("should return expected data structure", async () => {
    // Arrange
    const mockData = "expected output";
    setupMocks(mockData);

    // Act
    const result = await tool.execute(validInput, context);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.field).toBe(mockData);
    expect(result.metadata?.duration).toBeGreaterThan(0);
  });

  it("should handle empty results", async () => {
    setupMocks("");  // Empty result

    const result = await tool.execute(validInput, context);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);  // or appropriate empty state
  });
});
```

---

### Pattern 3: Error Handling

Test all error scenarios:

```typescript
describe("error handling", () => {
  it("should handle external command not found", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("spawn rg ENOENT");
    });

    const result = await tool.execute(input, context);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ripgrep/i);
  });

  it("should handle process errors", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcessWithError("Permission denied")
    );

    const result = await tool.execute(input, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("should handle timeout", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcessWithOptions({
        exitCode: 124,  // timeout exit code
        stderr: "Timeout"
      })
    );

    const result = await tool.execute(input, context);

    expect(result.success).toBe(false);
  });
});
```

---

### Pattern 4: Performance Testing

Verify metadata tracking:

```typescript
describe("performance", () => {
  it("should track execution duration", async () => {
    const result = await tool.execute(input, context);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.duration).toBeGreaterThan(0);
    expect(result.metadata?.timestamp).toBeGreaterThan(0);
    expect(result.metadata?.approved).toBe(true);
  });

  it("should complete within performance target", async () => {
    const start = Date.now();
    await tool.execute(input, context);
    const duration = Date.now() - start;

    // Tier A target: < 200ms
    // Relaxed for test environment
    expect(duration).toBeLessThan(500);
  });
});
```

---

### Pattern 5: Caching Tests

Verify cache behavior (if tool is cacheable):

```typescript
describe("caching", () => {
  it("should cache successful results", async () => {
    const input = { pattern: "*.ts", searchType: "name" };

    // First call - not cached
    const first = await tool.execute(input, context);
    expect(first.metadata?.cached).toBe(false);

    // Second call - cached
    const second = await tool.execute(input, context);
    expect(second.metadata?.cached).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  it("should not cache different inputs", async () => {
    await tool.execute({ pattern: "*.ts" }, context);
    const result = await tool.execute({ pattern: "*.js" }, context);

    expect(result.metadata?.cached).toBe(false);
  });
});
```

---

## Coverage Requirements

### Minimum Coverage per Tool

- ✅ Schema validation: 2-3 tests (valid, invalid type, missing field)
- ✅ Happy path: 2-3 tests (success, empty results, edge cases)
- ✅ Error handling: 2-3 tests (command not found, process error, timeout)
- ✅ Performance: 1 test (metadata tracking)
- ✅ Caching: 2 tests (cache hit, cache miss) - if applicable

**Total:** 9-12 tests per tool  
**Expected lines:** 100-150 lines per tool test file

---

## Running Tests

### Run All Tests

```bash
pnpm test
```

### Run Specific Test File

```bash
pnpm vitest run src/tools/filesystem/__tests__/searchFiles.test.ts
```

### Watch Mode

```bash
pnpm test:watch
```

### Coverage Report

```bash
pnpm test:coverage
```

**Target:** 80% coverage for `src/tools/`

---

## Common Pitfalls

### ❌ Don't Test Implementation Details

```typescript
// BAD - testing internal method
it("should call parseOutput internally", () => {
  const spy = vi.spyOn(tool, "parseOutput");
  tool.execute(input, context);
  expect(spy).toHaveBeenCalled();
});

// GOOD - test behavior
it("should parse output correctly", () => {
  const result = tool.execute(input, context);
  expect(result.data?.parsed).toBe(expected);
});
```

---

### ❌ Don't Mock What You're Testing

```typescript
// BAD - mocking the tool itself
const mockTool = { execute: vi.fn().mockResolvedValue({ success: true }) };

// GOOD - mock dependencies, test real tool
vi.mock("child_process");  // Mock dependency
const result = await RealTool.execute(input, context);  // Test real tool
```

---

### ❌ Don't Use Timeouts Unless Necessary

```typescript
// BAD - arbitrary timeout
it("should complete eventually", async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const result = await tool.execute(input, context);
  expect(result.success).toBe(true);
}, 2000);

// GOOD - deterministic mock
it("should complete", async () => {
  vi.mocked(spawn).mockReturnValue(createMockProcess(0, "output"));
  const result = await tool.execute(input, context);
  expect(result.success).toBe(true);
});
```

---

## Next Steps

- [Tools API Reference](tools-api.md) - API documentation for all tools
- [Performance Guide](performance.md) - Benchmarking and optimization
- [Tool Registry](../src/harness/toolRegistry.ts) - Source code

---

## Example: Complete Test File

See [searchFiles.test.ts](../src/tools/filesystem/__tests__/searchFiles.test.ts) for a complete example following all patterns.
