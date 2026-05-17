/**
 * Tests for PatchParser
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PatchParser } from "../parser";
import * as logger from "../../telemetry/logger";

vi.mock("../../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("PatchParser", () => {
  let parser: PatchParser;

  beforeEach(() => {
    parser = new PatchParser();
  });

  describe("parse", () => {
    it("should parse valid single patch", () => {
      const input = `<KORIX_PATCH file="test.ts">
<SEARCH>
old code
</SEARCH>
<REPLACE>
new code
</REPLACE>
</KORIX_PATCH>`;

      const { patches, errors } = parser.parse(input);

      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        file: "test.ts",
        search: "old code",
        replace: "new code",
      });
      expect(errors).toHaveLength(0);
    });

    it("should parse multiple patches", () => {
      const input = `<KORIX_PATCH file="file1.ts">
<SEARCH>code1</SEARCH>
<REPLACE>new1</REPLACE>
</KORIX_PATCH>
<KORIX_PATCH file="file2.ts">
<SEARCH>code2</SEARCH>
<REPLACE>new2</REPLACE>
</KORIX_PATCH>`;

      const { patches, errors } = parser.parse(input);

      expect(patches).toHaveLength(2);
      expect(errors).toHaveLength(0);
    });

    it("should handle empty REPLACE block", () => {
      const input = `<KORIX_PATCH file="test.ts">
<SEARCH>code to remove</SEARCH>
<REPLACE></REPLACE>
</KORIX_PATCH>`;

      const { patches } = parser.parse(input);

      expect(patches).toHaveLength(1);
      expect(patches[0].replace).toBe("");
    });

    it("should report error for missing file attribute", () => {
      const input = `<KORIX_PATCH>
<SEARCH>code</SEARCH>
<REPLACE>new</REPLACE>
</KORIX_PATCH>`;

      const { patches, errors } = parser.parse(input);

      expect(patches).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should normalize whitespace", () => {
      const input = `<KORIX_PATCH file="test.ts">
<SEARCH>
  code with spaces
  and more
</SEARCH>
<REPLACE>
  new code
</REPLACE>
</KORIX_PATCH>`;

      const { patches } = parser.parse(input);

      expect(patches[0].search).not.toContain("  \n");
      expect(patches[0].replace).not.toContain("  \n");
    });
  });

  describe("validate", () => {
    it("should validate correct patch", () => {
      const patch = {
        file: "test.ts",
        search: "old",
        replace: "new",
      };

      const result = parser.validate(patch);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject patch with missing file", () => {
      const patch = {
        file: "",
        search: "old",
        replace: "new",
      };

      const result = parser.validate(patch);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject patch with identical SEARCH and REPLACE", () => {
      const patch = {
        file: "test.ts",
        search: "same",
        replace: "same",
      };

      const result = parser.validate(patch);

      expect(result.valid).toBe(false);
    });
  });

  describe("format", () => {
    it("should format patch correctly", () => {
      const patch = {
        file: "test.ts",
        search: "old code",
        replace: "new code",
      };

      const formatted = parser.format(patch);

      expect(formatted).toContain('<KORIX_PATCH file="test.ts">');
      expect(formatted).toContain("<SEARCH>");
      expect(formatted).toContain("old code");
      expect(formatted).toContain("<REPLACE>");
      expect(formatted).toContain("new code");
    });
  });
});
