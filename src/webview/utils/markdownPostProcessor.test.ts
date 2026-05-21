/**
 * Tests for markdown post-processor
 */

import { describe, it, expect } from "vitest";
import {
  postProcessMarkdown,
  addStrategicEmojis,
  convertListsToTables,
  enhanceStructure,
} from "./markdownPostProcessor";

describe("addStrategicEmojis", () => {
  it("adds ⛔ emoji to CRITICAL header", () => {
    const input = "## CRITICAL: Never use any type";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ⛔ CRITICAL: Never use any type");
  });

  it("adds ⛔ emoji to CRÍTICO header (PT)", () => {
    const input = "## CRÍTICO: Nunca use any";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ⛔ CRÍTICO: Nunca use any");
  });

  it("adds ⚠️ emoji to WARNING header", () => {
    const input = "## WARNING: Check this carefully";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ⚠️ WARNING: Check this carefully");
  });

  it("adds ❌ emoji to ERROR header", () => {
    const input = "## ERROR: Invalid configuration";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ❌ ERROR: Invalid configuration");
  });

  it("adds ✅ emoji to SUCCESS header", () => {
    const input = "## SUCCESS: Operation completed";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ✅ SUCCESS: Operation completed");
  });

  it("adds ⚠️ emoji to IMPORTANTE header", () => {
    const input = "## IMPORTANTE: Leia isso";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## ⚠️ IMPORTANTE: Leia isso");
  });

  it("does NOT add emoji to normal headers", () => {
    const input = "## Configuration Options";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## Configuration Options");
  });

  it("removes decorative emojis from normal headers", () => {
    const input = "## 🎯 Configuration Options";
    const output = addStrategicEmojis(input);
    expect(output).toBe("## Configuration Options");
  });

  it("preserves existing strategic emojis", () => {
    const input = "## ⛔ CRITICAL: Already has emoji";
    const output = addStrategicEmojis(input);
    expect(output).toContain("⛔");
    expect(output).not.toMatch(/⛔.*⛔/); // No duplicate
  });

  it("handles multiple headers in one markdown string", () => {
    const input = `## CRITICAL: First
## Normal Header
## WARNING: Second`;

    const output = addStrategicEmojis(input);
    expect(output).toContain("⛔ CRITICAL");
    expect(output).toContain("⚠️ WARNING");
    expect(output).toContain("## Normal Header");
    expect(output).not.toMatch(/##\s+⛔\s+Normal/);
  });
});

describe("convertListsToTables", () => {
  it("converts comparison list to table", () => {
    const input = `Compare modes:
- **ASK Mode**: Read-only analysis
- **PLAN Mode**: Architecture planning
- **AGENT Mode**: Full execution`;

    const output = convertListsToTables(input);
    expect(output).toContain("| Mode | Description |");
    expect(output).toContain("|------|-------------|");
    expect(output).toContain("| ASK Mode | Read-only analysis |");
    expect(output).toContain("| PLAN Mode | Architecture planning |");
    expect(output).toContain("| AGENT Mode | Full execution |");
  });

  it("leaves non-comparison lists unchanged", () => {
    const input = `Steps:
- First step
- Second step`;

    const output = convertListsToTables(input);
    expect(output).toBe(input); // No change
  });

  it("leaves lists with < 3 items unchanged", () => {
    const input = `Options:
- **Option A**: Description A
- **Option B**: Description B`;

    const output = convertListsToTables(input);
    expect(output).toBe(input); // Not enough items
  });

  it("does NOT convert lists inside code blocks", () => {
    const input = `Example:
\`\`\`markdown
- **Item 1**: Description 1
- **Item 2**: Description 2
- **Item 3**: Description 3
\`\`\``;

    const output = convertListsToTables(input);
    expect(output).not.toContain("| Name | Description |"); // Should NOT convert
  });

  it("converts multiple comparison lists in same markdown", () => {
    const input = `First list:
- **A**: Description A
- **B**: Description B
- **C**: Description C

Second list:
- **X**: Description X
- **Y**: Description Y
- **Z**: Description Z`;

    const output = convertListsToTables(input);
    const tableCount = (output.match(/\| Name \| Description \|/g) ?? [])
      .length;
    expect(tableCount).toBe(2);
  });

  it("handles list items with complex descriptions", () => {
    const input = `Tools:
- **ReadFile**: Read file contents (cached 5min)
- **WriteFile**: Create/overwrite files (requires approval)
- **EditFile**: Apply patches in KORIX_PATCH format`;

    const output = convertListsToTables(input);
    expect(output).toContain("| Tool | Description |");
    expect(output).toContain("| ReadFile | Read file contents (cached 5min) |");
  });
});

describe("enhanceStructure", () => {
  it("converts file paths to links", () => {
    const input =
      "Edit the file src/webview/components/chat/MarkdownContent.tsx to add the processor.";
    const output = enhanceStructure(input);
    expect(output).toContain(
      "[src/webview/components/chat/MarkdownContent.tsx](src/webview/components/chat/MarkdownContent.tsx)",
    );
  });

  it("does NOT convert file paths inside inline code", () => {
    const input = "Use `src/webview/utils/helper.ts` for utilities.";
    const output = enhanceStructure(input);
    expect(output).toBe(input); // No change
  });

  it("does NOT convert file paths inside code blocks", () => {
    const input = `Example:\n\`\`\`typescript\nimport { foo } from 'src/utils/foo.ts';\n\`\`\``;
    const output = enhanceStructure(input);
    expect(output).not.toMatch(/\[src\/utils\/foo\.ts\]/); // Should NOT convert
  });

  it("handles multiple file paths in same text", () => {
    const input = "Modify src/file1.ts and src/file2.ts together.";
    const output = enhanceStructure(input);
    expect(output).toContain("[src/file1.ts](src/file1.ts)");
    expect(output).toContain("[src/file2.ts](src/file2.ts)");
  });

  it("does NOT convert paths that are already markdown links", () => {
    const input = "See [src/example.ts](src/example.ts) for details.";
    const output = enhanceStructure(input);
    // Count occurrences of the path - should appear only once (already a link)
    const matches = output.match(/src\/example\.ts/g);
    expect(matches?.length).toBe(2); // Once in text, once in URL
  });

  it("supports various file extensions", () => {
    const input =
      "Files: src/app.ts, src/style.css, src/config.json, src/test.test.tsx";
    const output = enhanceStructure(input);
    expect(output).toContain("[src/app.ts](src/app.ts)");
    expect(output).toContain("[src/style.css](src/style.css)");
    expect(output).toContain("[src/config.json](src/config.json)");
    expect(output).toContain("[src/test.test.tsx](src/test.test.tsx)");
  });
});

describe("postProcessMarkdown (full pipeline)", () => {
  it("applies all transformations when all options enabled", () => {
    const input = `## CRITICAL: Important Rules

Compare modes:
- **ASK**: Read-only
- **PLAN**: Planning
- **AGENT**: Execution

Edit src/webview/utils/processor.ts to implement.`;

    const output = postProcessMarkdown(input, {
      addStrategicEmojis: true,
      convertToTables: true,
      enhanceStructure: true,
    });

    // Strategic emoji
    expect(output).toContain("⛔ CRITICAL");

    // Table conversion
    expect(output).toContain("| Mode | Description |");
    expect(output).toContain("| ASK | Read-only |");

    // File path link
    expect(output).toContain(
      "[src/webview/utils/processor.ts](src/webview/utils/processor.ts)",
    );
  });

  it("skips transformations when options disabled", () => {
    const input = `## CRITICAL: Test
- **A**: Description A
- **B**: Description B
- **C**: Description C`;

    const output = postProcessMarkdown(input, {
      addStrategicEmojis: false,
      convertToTables: false,
      enhanceStructure: false,
    });

    // No transformations applied
    expect(output).toBe(input);
  });

  it("applies only selected transformations", () => {
    const input = `## CRITICAL: Test
- **A**: Description A
- **B**: Description B
- **C**: Description C`;

    const output = postProcessMarkdown(input, {
      addStrategicEmojis: true,
      convertToTables: false, // Skip table conversion
      enhanceStructure: false,
    });

    // Only emoji transformation
    expect(output).toContain("⛔ CRITICAL");
    expect(output).not.toContain("| Name | Description |");
  });
});
