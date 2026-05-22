import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockToolContext } from "../__tests__/factories/toolContext.factory";

const vscodeMocks = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  readFile: vi.fn(async (uri: { readonly fsPath: string }) => {
    const content = vscodeMocks.files.get(uri.fsPath);
    if (!content) {
      throw new Error(`File not found: ${uri.fsPath}`);
    }
    return content;
  }),
}));

vi.mock("vscode", () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
  },
  workspace: {
    fs: {
      readFile: vscodeMocks.readFile,
    },
  },
  FileType: {
    Directory: 2,
    File: 1,
  },
}));

import { ReadFileTool } from "./filesystem";

function createPng(width: number, height: number): Uint8Array {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47], 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function createJpeg(width: number, height: number): Uint8Array {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
  ]);
}

function createGif(width: number, height: number): Uint8Array {
  const buffer = Buffer.alloc(10);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

describe("ReadFileTool", () => {
  beforeEach(() => {
    vscodeMocks.files.clear();
    vscodeMocks.readFile.mockClear();
  });

  it("should accept image encoding in the schema", () => {
    expect(
      ReadFileTool.schema.safeParse({
        path: "assets/logo.png",
        encoding: "image",
        imageMetadata: true,
      }).success,
    ).toBe(true);
  });

  it("should keep utf-8 text reads compatible", async () => {
    vscodeMocks.files.set(
      "/test/workspace/README.md",
      Buffer.from("hello", "utf-8"),
    );

    const result = await ReadFileTool.execute(
      { path: "README.md" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toBe("hello");
  });

  it("should keep base64 reads compatible", async () => {
    const content = Buffer.from("hello", "utf-8");
    vscodeMocks.files.set("/test/workspace/README.md", content);

    const result = await ReadFileTool.execute(
      { path: "README.md", encoding: "base64" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toBe(content.toString("base64"));
  });

  it("should read PNG images with metadata", async () => {
    const content = createPng(320, 180);
    vscodeMocks.files.set("/test/workspace/assets/logo.png", content);

    const result = await ReadFileTool.execute(
      { path: "assets/logo.png", encoding: "image" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      image: {
        base64: Buffer.from(content).toString("base64"),
        format: "png",
        width: 320,
        height: 180,
        size: content.byteLength,
      },
    });
  });

  it("should read JPEG images with metadata", async () => {
    const content = createJpeg(640, 480);
    vscodeMocks.files.set("/test/workspace/assets/photo.jpg", content);

    const result = await ReadFileTool.execute(
      { path: "assets/photo.jpg", encoding: "image" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      image: {
        base64: Buffer.from(content).toString("base64"),
        format: "jpeg",
        width: 640,
        height: 480,
        size: content.byteLength,
      },
    });
  });

  it("should read GIF images with metadata", async () => {
    const content = createGif(42, 24);
    vscodeMocks.files.set("/test/workspace/assets/spinner.gif", content);

    const result = await ReadFileTool.execute(
      { path: "assets/spinner.gif", encoding: "image" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toEqual({
      image: {
        base64: Buffer.from(content).toString("base64"),
        format: "gif",
        width: 42,
        height: 24,
        size: content.byteLength,
      },
    });
  });

  it("should fall back to text for non-image files requested as image", async () => {
    vscodeMocks.files.set(
      "/test/workspace/notes.txt",
      Buffer.from("plain text", "utf-8"),
    );

    const result = await ReadFileTool.execute(
      { path: "notes.txt", encoding: "image" },
      createMockToolContext(),
    );

    expect(result.success, result.error).toBe(true);
    expect(result.data).toBe("plain text");
  });
});
