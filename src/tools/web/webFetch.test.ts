import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../../__tests__/factories/toolContext.factory";
import { globalToolRegistry } from "../../harness/toolRegistry";
import { WebFetchTool } from "./webFetch";

vi.mock("../../telemetry/logger", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { registerAllTools } from "../index";

interface MockResponseOptions {
  readonly status?: number;
  readonly contentType?: string;
  readonly body?: string;
  readonly url?: string;
  readonly headers?: Record<string, string>;
}

class MockHeaders {
  constructor(private readonly values: Record<string, string>) {}

  get(name: string): string | null {
    return this.values[name.toLowerCase()] ?? null;
  }
}

class MockResponse {
  readonly status: number;
  readonly headers: MockHeaders;
  readonly url: string;

  constructor(private readonly options: MockResponseOptions = {}) {
    this.status = options.status ?? 200;
    this.url = options.url ?? "https://example.com/docs";
    this.headers = new MockHeaders({
      "content-type": options.contentType ?? "text/plain",
      ...(options.headers ?? {}),
    });
  }

  async text(): Promise<string> {
    return this.options.body ?? "";
  }
}

function mockFetch(response: MockResponse): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function resetGlobalRegistry(): void {
  for (const tool of globalToolRegistry.list()) {
    globalToolRegistry.unregister(tool.name);
  }
}

describe("WebFetchTool", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetGlobalRegistry();
  });

  it("should reject non-http protocols", async () => {
    const result = await WebFetchTool.execute(
      { url: "file:///etc/passwd" },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("http");
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.0.1/docs",
    "http://192.168.1.10/docs",
    "http://172.16.0.10/docs",
    "http://169.254.169.254/latest/meta-data",
  ])("should reject local or private host %s", async (url) => {
    const result = await WebFetchTool.execute({ url }, createMockToolContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("should fetch and convert HTML to markdown", async () => {
    mockFetch(
      new MockResponse({
        contentType: "text/html; charset=utf-8",
        body: '<html><body><h1>Docs</h1><p>Hello <a href="/api">API</a></p><script>bad()</script></body></html>',
      }),
    );

    const result = await WebFetchTool.execute(
      { url: "https://example.com/docs" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data?.markdown).toContain("# Docs");
    expect(result.data?.markdown).toContain("Hello [API](/api)");
    expect(result.data?.markdown).not.toContain("bad()");
  });

  it("should pretty-print JSON responses", async () => {
    mockFetch(
      new MockResponse({
        contentType: "application/json",
        body: '{"ok":true,"items":[1,2]}',
      }),
    );

    const result = await WebFetchTool.execute(
      { url: "https://example.com/data.json" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data?.markdown).toContain("```json");
    expect(result.data?.markdown).toContain('"ok": true');
  });

  it("should return plain text unchanged", async () => {
    mockFetch(
      new MockResponse({
        contentType: "text/plain",
        body: "plain docs",
      }),
    );

    const result = await WebFetchTool.execute(
      { url: "https://example.com/readme.txt" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data?.markdown).toBe("plain docs");
  });

  it("should pass manual redirect mode when redirects are disabled", async () => {
    const fetchMock = mockFetch(new MockResponse());

    await WebFetchTool.execute(
      { url: "https://example.com/docs", followRedirects: false },
      createMockToolContext(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/docs",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("should validate redirect targets when following redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new MockResponse({
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await WebFetchTool.execute(
      { url: "https://example.com/redirect", followRedirects: true },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("should timeout after the specified duration", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );

    const promise = WebFetchTool.execute(
      { url: "https://example.com/slow", timeout: 100 },
      createMockToolContext(),
    );
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("should handle fetch errors gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await WebFetchTool.execute(
      { url: "https://example.com/docs" },
      createMockToolContext(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("network down");
  });

  it("should be registered by registerAllTools", () => {
    registerAllTools();

    expect(globalToolRegistry.has("WebFetch")).toBe(true);
  });
});
