import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "../../harness/toolRegistry";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;

const WebFetchSchema = z.object({
  url: z.string().url().describe("HTTP(S) URL to fetch"),
  timeout: z.number().int().min(100).max(30_000).optional(),
  followRedirects: z.boolean().optional(),
  maxBytes: z.number().int().min(1).max(5_000_000).optional(),
});

type WebFetchInput = z.infer<typeof WebFetchSchema>;

export interface WebFetchOutput {
  readonly markdown: string;
  readonly url: string;
  readonly statusCode: number;
  readonly contentType: string;
}

export const WebFetchTool: Tool<WebFetchInput, WebFetchOutput> = {
  name: "WebFetch",
  description: `Fetch a public HTTP(S) URL and return readable Markdown.

Supports HTML, JSON and plain text. Blocks local/private hosts and limits response size.`,
  schema: WebFetchSchema,

  allowedInMode(): boolean {
    return true;
  },

  async execute(
    input: WebFetchInput,
    context: ToolContext,
  ): Promise<ToolResult<WebFetchOutput>> {
    const startTime = Date.now();
    const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
    let timedOut = false;

    try {
      const initialUrl = validatePublicHttpUrl(input.url);
      const controller = new AbortController();
      const abortFromContext = () => controller.abort();
      if (context.signal?.aborted) {
        abortFromContext();
      } else {
        context.signal?.addEventListener("abort", abortFromContext, {
          once: true,
        });
      }
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);

      try {
        const response = await fetchWithRedirects({
          url: initialUrl,
          signal: controller.signal,
          followRedirects: input.followRedirects ?? true,
          maxBytes,
        });
        const contentType =
          response.headers.get("content-type") ?? "text/plain";
        const text = await response.text();
        const markdown = convertToMarkdown(text, contentType);

        return {
          success: true,
          data: {
            markdown,
            url: response.url || initialUrl.toString(),
            statusCode: response.status,
            contentType,
          },
          metadata: {
            duration: Date.now() - startTime,
            approved: true,
            timestamp: startTime,
          },
        };
      } finally {
        clearTimeout(timeoutId);
        context.signal?.removeEventListener("abort", abortFromContext);
      }
    } catch (error) {
      const message = normalizeErrorMessage(
        error,
        context.signal?.aborted === true && !timedOut,
      );
      return {
        success: false,
        error: `WebFetch failed: ${message}`,
        metadata: {
          duration: Date.now() - startTime,
          approved: true,
          timestamp: startTime,
        },
      };
    }
  },
};

interface FetchWithRedirectsOptions {
  readonly url: URL;
  readonly signal: AbortSignal;
  readonly followRedirects: boolean;
  readonly maxBytes: number;
}

async function fetchWithRedirects(
  options: FetchWithRedirectsOptions,
): Promise<Response> {
  let currentUrl = options.url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(currentUrl.toString(), {
      signal: options.signal,
      redirect: "manual",
    });
    assertResponseSize(response, options.maxBytes);

    if (!options.followRedirects || !isRedirect(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    currentUrl = validatePublicHttpUrl(
      new URL(location, currentUrl).toString(),
    );
  }

  throw new Error("too many redirects");
}

function validatePublicHttpUrl(value: string): URL {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http and https URLs are allowed");
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error(`host is not allowed: ${url.hostname}`);
  }

  return url;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first = 0, second = 0] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

function assertResponseSize(response: Response, maxBytes: number): void {
  const contentLength = response.headers.get("content-length");
  if (!contentLength) {
    return;
  }

  const parsed = Number.parseInt(contentLength, 10);
  if (Number.isFinite(parsed) && parsed > maxBytes) {
    throw new Error(`response too large: ${parsed} bytes`);
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function convertToMarkdown(text: string, contentType: string): string {
  const normalizedContentType = contentType.toLowerCase();

  if (
    normalizedContentType.includes("application/json") ||
    normalizedContentType.includes("+json")
  ) {
    return formatJson(text);
  }

  if (normalizedContentType.includes("text/html")) {
    return htmlToMarkdown(text);
  }

  return text;
}

function formatJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
  } catch {
    return text;
  }
}

function htmlToMarkdown(html: string): string {
  let markdown = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(
      /<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
      "\n\n```\n$1\n```\n",
    )
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, "\n\n```\n$1\n```\n")
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_match, level, content) => {
        const depth = Number.parseInt(`${level}`, 10);
        return `\n\n${"#".repeat(depth)} ${stripTags(`${content}`).trim()}\n\n`;
      },
    )
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href, content) => {
        return `[${stripTags(`${content}`).trim()}](${href})`;
      },
    )
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => {
      return `\n- ${stripTags(`${content}`).trim()}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/section>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  markdown = decodeHtmlEntities(markdown);
  return markdown
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ""));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeErrorMessage(error: unknown, abortedByContext: boolean): string {
  if (isNamedError(error, "AbortError")) {
    return abortedByContext ? "request aborted" : "request timed out";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}

function isNamedError(error: unknown, name: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === name
  );
}
