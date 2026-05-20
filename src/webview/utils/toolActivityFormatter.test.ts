import { describe, expect, it } from "vitest";
import { formatToolActivity } from "./toolActivityFormatter";

describe("formatToolActivity", () => {
  it("should format read tools with file names", () => {
    expect(
      formatToolActivity("ReadFile", {
        path: "/workspace/package.json",
      }),
    ).toEqual({
      action: "Read",
      targetLabel: "package.json",
      label: "Read package.json",
    });
  });

  it("should format write tools with file names", () => {
    expect(
      formatToolActivity("WriteFile", {
        path: "src/app.ts",
      }).label,
    ).toBe("Write app.ts");
  });

  it("should format run commands as bash activity", () => {
    expect(
      formatToolActivity("RunCommand", {
        command: "pnpm run test -- --watch=false",
      }).label,
    ).toBe("Bash pnpm run test -- --watch=false");
  });

  it("should format search tools with query text", () => {
    expect(
      formatToolActivity("Grep", {
        pattern: "ThinkingContainer",
      }).label,
    ).toBe('Search "ThinkingContainer"');
  });
});
