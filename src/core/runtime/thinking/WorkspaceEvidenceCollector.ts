import * as path from "path";
import type { ToolRegistry, ToolResult } from "../../../harness/toolRegistry";
import type {
  EvidencePack,
  EvidenceItem,
  OmittedWorkspaceEvidenceFile,
  WorkspaceEvidenceCollection,
  WorkspaceEvidenceCollectionRequest,
  WorkspaceEvidenceFile,
} from "./types";

interface SearchMatch {
  readonly path: string;
}

interface DirectoryEntry {
  readonly name: string;
  readonly type: "file" | "directory";
}

interface FileChunk {
  readonly chunk: string;
  readonly isComplete?: boolean;
}

export class WorkspaceEvidenceCollector {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async collect(
    request: WorkspaceEvidenceCollectionRequest,
  ): Promise<WorkspaceEvidenceCollection> {
    const startedAt = Date.now();
    const omittedFiles: OmittedWorkspaceEvidenceFile[] = [];
    const candidates = await this.findCandidateFiles(request);
    const safeCandidates = this.filterSafeCandidates(
      candidates,
      request.context.workspaceRoot,
      omittedFiles,
    );

    if (safeCandidates.length === 0) {
      return this.emptyFailure(
        startedAt,
        "No workspace files matched the evidence plan.",
        omittedFiles,
      );
    }

    const selected = safeCandidates.slice(0, request.plan.maxFiles);
    for (const omitted of safeCandidates.slice(request.plan.maxFiles)) {
      omittedFiles.push({ path: omitted, reason: "max_files" });
    }

    const files: WorkspaceEvidenceFile[] = [];
    for (const filePath of selected) {
      const file = await this.readEvidenceFile(request, filePath);
      if (file) {
        files.push(file);
      } else {
        omittedFiles.push({ path: filePath, reason: "read_failed" });
      }
    }

    if (files.length === 0) {
      return this.emptyFailure(
        startedAt,
        "Workspace evidence files could not be read.",
        omittedFiles,
      );
    }

    const evidence = this.buildEvidencePack(files);

    return {
      success: true,
      summary: `${files.length} workspace file(s) collected in batch.`,
      evidence,
      files,
      omittedFiles,
      duration: Date.now() - startedAt,
    };
  }

  private async findCandidateFiles(
    request: WorkspaceEvidenceCollectionRequest,
  ): Promise<readonly string[]> {
    if (this.toolRegistry.has("SearchFiles")) {
      const searchResults = await this.searchFiles(request);
      if (searchResults.length > 0) {
        return searchResults;
      }
    }

    if (this.toolRegistry.has("ListDirectory")) {
      return await this.listDirectory(request);
    }

    return [];
  }

  private async searchFiles(
    request: WorkspaceEvidenceCollectionRequest,
  ): Promise<readonly string[]> {
    const hint = request.plan.targetHints[0] ?? "*";
    const result = await this.toolRegistry.execute<readonly SearchMatch[]>(
      "SearchFiles",
      {
        pattern: hint,
        searchType: request.plan.kind === "search" ? "content" : "name",
        maxResults: Math.max(request.plan.maxFiles * 2, request.plan.maxFiles),
        fileTypes: ["ts", "tsx", "js", "jsx", "json", "md"],
        excludePaths: ["node_modules/**", "dist/**", ".git/**"],
      },
      this.buildToolContext(request),
    );

    if (!result.success || !this.isSearchMatches(result.data)) {
      return [];
    }

    return result.data
      .map((match) => match.path)
      .filter((filePath) => filePath.trim().length > 0)
      .sort((left, right) => left.localeCompare(right));
  }

  private async listDirectory(
    request: WorkspaceEvidenceCollectionRequest,
  ): Promise<readonly string[]> {
    const result = await this.toolRegistry.execute<readonly DirectoryEntry[]>(
      "ListDirectory",
      { path: ".", recursive: false },
      this.buildToolContext(request),
    );

    if (!result.success || !this.isDirectoryEntries(result.data)) {
      return [];
    }

    return result.data
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  private filterSafeCandidates(
    candidates: readonly string[],
    workspaceRoot: string,
    omittedFiles: OmittedWorkspaceEvidenceFile[],
  ): readonly string[] {
    const unique = new Set<string>();
    const safe: string[] = [];

    for (const candidate of candidates) {
      if (unique.has(candidate)) {
        continue;
      }
      unique.add(candidate);

      if (!this.isInsideWorkspace(candidate, workspaceRoot)) {
        omittedFiles.push({ path: candidate, reason: "outside_workspace" });
        continue;
      }

      safe.push(candidate);
    }

    return safe;
  }

  private async readEvidenceFile(
    request: WorkspaceEvidenceCollectionRequest,
    filePath: string,
  ): Promise<WorkspaceEvidenceFile | undefined> {
    if (this.toolRegistry.has("FileChunks")) {
      const result = await this.toolRegistry.execute<FileChunk>(
        "FileChunks",
        {
          path: filePath,
          chunkSize: 12000,
          startByte: 0,
        },
        this.buildToolContext(request),
      );
      const chunk = this.extractChunk(result);

      if (chunk !== undefined) {
        return {
          path: filePath,
          content: chunk.content,
          sourceTool: "FileChunks",
          truncated: chunk.truncated,
        };
      }
    }

    if (!this.toolRegistry.has("ReadFile")) {
      return undefined;
    }

    const result = await this.toolRegistry.execute<string>(
      "ReadFile",
      { path: filePath },
      this.buildToolContext(request),
    );

    if (!result.success || typeof result.data !== "string") {
      return undefined;
    }

    return {
      path: filePath,
      content: result.data,
      sourceTool: "ReadFile",
      truncated: false,
    };
  }

  private extractChunk(
    result: ToolResult<FileChunk>,
  ): { readonly content: string; readonly truncated: boolean } | undefined {
    if (!result.success || !result.data) {
      return undefined;
    }

    return {
      content: result.data.chunk,
      truncated: result.data.isComplete === false,
    };
  }

  private buildEvidencePack(
    files: readonly WorkspaceEvidenceFile[],
  ): EvidencePack {
    const items: EvidenceItem[] = files.map((file, index) => ({
      path: file.path,
      priority: index + 1,
      tokenCount: this.estimateTokens(file.content),
    }));

    return {
      summary: `${files.length} batch evidence file(s), ${items.reduce(
        (sum, item) => sum + item.tokenCount,
        0,
      )} estimated tokens.`,
      providerContext: files
        .map((file) =>
          [
            `### ${file.path}`,
            file.truncated ? "(truncated chunk)" : "(complete chunk)",
            file.content,
          ].join("\n"),
        )
        .join("\n\n"),
      items,
      totalTokens: items.reduce((sum, item) => sum + item.tokenCount, 0),
    };
  }

  private buildToolContext(request: WorkspaceEvidenceCollectionRequest) {
    return {
      execution: request.context,
      workspaceRoot: request.context.workspaceRoot,
    };
  }

  private emptyFailure(
    startedAt: number,
    error: string,
    omittedFiles: readonly OmittedWorkspaceEvidenceFile[],
  ): WorkspaceEvidenceCollection {
    return {
      success: false,
      summary: error,
      evidence: {
        summary: error,
        providerContext: "",
        items: [],
        totalTokens: 0,
      },
      files: [],
      omittedFiles,
      duration: Date.now() - startedAt,
      error,
    };
  }

  private isInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
    const root = path.resolve(workspaceRoot);
    const absolute = path.isAbsolute(candidate)
      ? path.resolve(candidate)
      : path.resolve(root, candidate);

    return absolute === root || absolute.startsWith(`${root}${path.sep}`);
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private isSearchMatches(value: unknown): value is readonly SearchMatch[] {
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          this.isRecord(item) &&
          typeof item.path === "string" &&
          item.path.trim().length > 0,
      )
    );
  }

  private isDirectoryEntries(
    value: unknown,
  ): value is readonly DirectoryEntry[] {
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          this.isRecord(item) &&
          typeof item.name === "string" &&
          (item.type === "file" || item.type === "directory"),
      )
    );
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
