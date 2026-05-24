import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type {
  ContextCacheFileMetadata,
  ContextCacheGraphEdge,
  ContextCacheSnapshot,
  ContextCacheSummary,
  ContextCacheStrategy,
} from "./types";

type SqlValue = string | number | null;

interface SQLiteStatement {
  run(...params: SqlValue[]): void;
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}

interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  close(): void;
}

interface SQLiteModule {
  readonly DatabaseSync: new (path: string) => SQLiteDatabase;
}

interface FileMetadataRow {
  readonly path: string;
  readonly content_hash: string;
  readonly parser_version: string;
  readonly strategy_version: string;
  readonly language: string | null;
  readonly last_modified: number | null;
  readonly estimated_tokens: number;
}

interface MetadataRow {
  readonly snapshot_version: "0.1";
  readonly content_hash_algorithm: "fnv1a32-utf16" | "fnv1a64-utf8";
  readonly parser_version: string;
  readonly strategy_version: string;
}

interface GraphEdgeRow {
  readonly source_path: string;
  readonly target_path: string;
  readonly edge_type: "import";
}

interface SummaryRow {
  readonly id: string;
  readonly kind: "file";
  readonly path: string;
  readonly source_hash: string;
  readonly summary: string;
  readonly estimated_tokens: number;
  readonly reason_codes: string;
}

const requireFromRuntime = createRequire(
  typeof __filename === "string" ? __filename : `${process.cwd()}/package.json`,
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSQLiteModule(value: unknown): value is SQLiteModule {
  return isObject(value) && typeof value.DatabaseSync === "function";
}

export function isNodeSQLiteRuntimeAvailable(): boolean {
  try {
    const sqliteModule: unknown = requireFromRuntime("node:sqlite");
    return isSQLiteModule(sqliteModule);
  } catch {
    return false;
  }
}

function isFileMetadataRow(value: unknown): value is FileMetadataRow {
  return (
    isObject(value) &&
    typeof value.path === "string" &&
    typeof value.content_hash === "string" &&
    typeof value.parser_version === "string" &&
    typeof value.strategy_version === "string" &&
    (typeof value.language === "string" || value.language === null) &&
    (typeof value.last_modified === "number" || value.last_modified === null) &&
    typeof value.estimated_tokens === "number"
  );
}

function isMetadataRow(value: unknown): value is MetadataRow {
  return (
    isObject(value) &&
    value.snapshot_version === "0.1" &&
    (value.content_hash_algorithm === "fnv1a32-utf16" ||
      value.content_hash_algorithm === "fnv1a64-utf8") &&
    typeof value.parser_version === "string" &&
    typeof value.strategy_version === "string"
  );
}

function isGraphEdgeRow(value: unknown): value is GraphEdgeRow {
  return (
    isObject(value) &&
    typeof value.source_path === "string" &&
    typeof value.target_path === "string" &&
    value.edge_type === "import"
  );
}

function isSummaryRow(value: unknown): value is SummaryRow {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    value.kind === "file" &&
    typeof value.path === "string" &&
    typeof value.source_hash === "string" &&
    typeof value.summary === "string" &&
    typeof value.estimated_tokens === "number" &&
    typeof value.reason_codes === "string"
  );
}

function parseReasonCodes(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function loadSQLiteModule(): Promise<SQLiteModule | undefined> {
  if (!isNodeSQLiteRuntimeAvailable()) {
    return undefined;
  }

  try {
    const sqliteModule: unknown = await import("node:sqlite");
    return isSQLiteModule(sqliteModule) ? sqliteModule : undefined;
  } catch {
    return undefined;
  }
}

export class SQLiteContextCacheStore {
  private database?: SQLiteDatabase;

  constructor(private readonly databasePath: string) {}

  async open(): Promise<boolean> {
    const sqliteModule = await loadSQLiteModule();
    if (sqliteModule === undefined) {
      return false;
    }

    await mkdir(dirname(this.databasePath), { recursive: true });
    const database = new sqliteModule.DatabaseSync(this.databasePath);
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS context_cache_meta (
          root TEXT PRIMARY KEY NOT NULL,
          snapshot_version TEXT NOT NULL,
          content_hash_algorithm TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          strategy_version TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS context_cache_files (
          root TEXT NOT NULL,
          path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          strategy_version TEXT NOT NULL,
          language TEXT,
          last_modified REAL,
          estimated_tokens INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
        PRIMARY KEY (root, path)
      );

      CREATE TABLE IF NOT EXISTS context_cache_graph_edges (
        root TEXT NOT NULL,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (root, source_path, target_path, edge_type)
      );

      CREATE TABLE IF NOT EXISTS context_cache_summaries (
        root TEXT NOT NULL,
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        summary TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        reason_codes TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (root, id)
      );
    `);
    } catch (error) {
      database.close();
      throw error;
    }

    this.database = database;

    return true;
  }

  loadSnapshot(
    root: string,
    expectedStrategy: ContextCacheStrategy,
  ): ContextCacheSnapshot | undefined {
    if (this.database === undefined) {
      return undefined;
    }

    const metadata = this.database
      .prepare(
        `SELECT snapshot_version, content_hash_algorithm, parser_version, strategy_version
         FROM context_cache_meta
         WHERE root = ?`,
      )
      .get(root);

    if (!isMetadataRow(metadata)) {
      return undefined;
    }

    const strategy = {
      contentHashAlgorithm: metadata.content_hash_algorithm,
      parserVersion: metadata.parser_version,
      strategyVersion: metadata.strategy_version,
    };

    if (
      strategy.contentHashAlgorithm !== expectedStrategy.contentHashAlgorithm ||
      strategy.parserVersion !== expectedStrategy.parserVersion ||
      strategy.strategyVersion !== expectedStrategy.strategyVersion
    ) {
      return undefined;
    }

    const rows = this.database
      .prepare(
        `SELECT path, content_hash, parser_version, strategy_version, language, last_modified, estimated_tokens
         FROM context_cache_files
         WHERE root = ?
         ORDER BY path`,
      )
      .all(root);
    const files = rows.filter(isFileMetadataRow).map(
      (row): ContextCacheFileMetadata => ({
        path: row.path,
        contentHash: row.content_hash,
        parserVersion: row.parser_version,
        strategyVersion: row.strategy_version,
        language: row.language ?? undefined,
        lastModified: row.last_modified ?? undefined,
        estimatedTokens: row.estimated_tokens,
      }),
    );
    const edgeRows = this.database
      .prepare(
        `SELECT source_path, target_path, edge_type
         FROM context_cache_graph_edges
         WHERE root = ?
         ORDER BY source_path, target_path, edge_type`,
      )
      .all(root);
    const graphEdges = edgeRows.filter(isGraphEdgeRow).map(
      (row): ContextCacheGraphEdge => ({
        from: row.source_path,
        to: row.target_path,
        type: row.edge_type,
      }),
    );
    const summaryRows = this.database
      .prepare(
        `SELECT id, kind, path, source_hash, summary, estimated_tokens, reason_codes
         FROM context_cache_summaries
         WHERE root = ?
         ORDER BY id`,
      )
      .all(root);
    const summaries = summaryRows.filter(isSummaryRow).map(
      (row): ContextCacheSummary => ({
        id: row.id,
        kind: row.kind,
        path: row.path,
        sourceHash: row.source_hash,
        summary: row.summary,
        estimatedTokens: row.estimated_tokens,
        reasonCodes: parseReasonCodes(row.reason_codes),
      }),
    );

    return {
      version: metadata.snapshot_version,
      strategy,
      files,
      graphEdges,
      summaries,
    };
  }

  saveSnapshot(root: string, snapshot: ContextCacheSnapshot): void {
    if (this.database === undefined) {
      return;
    }

    const updatedAt = Date.now();
    this.database.exec("BEGIN");
    try {
      this.database
        .prepare(
          `INSERT OR REPLACE INTO context_cache_meta
           (root, snapshot_version, content_hash_algorithm, parser_version, strategy_version, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          root,
          snapshot.version,
          snapshot.strategy.contentHashAlgorithm,
          snapshot.strategy.parserVersion,
          snapshot.strategy.strategyVersion,
          updatedAt,
        );
      this.database
        .prepare("DELETE FROM context_cache_files WHERE root = ?")
        .run(root);
      this.database
        .prepare("DELETE FROM context_cache_graph_edges WHERE root = ?")
        .run(root);
      this.database
        .prepare("DELETE FROM context_cache_summaries WHERE root = ?")
        .run(root);

      const insertFile = this.database.prepare(
        `INSERT INTO context_cache_files
         (root, path, content_hash, parser_version, strategy_version, language, last_modified, estimated_tokens, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const file of snapshot.files) {
        insertFile.run(
          root,
          file.path,
          file.contentHash,
          file.parserVersion,
          file.strategyVersion,
          file.language ?? null,
          file.lastModified ?? null,
          file.estimatedTokens,
          updatedAt,
        );
      }

      const insertEdge = this.database.prepare(
        `INSERT INTO context_cache_graph_edges
         (root, source_path, target_path, edge_type, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );

      for (const edge of snapshot.graphEdges ?? []) {
        insertEdge.run(root, edge.from, edge.to, edge.type, updatedAt);
      }

      const insertSummary = this.database.prepare(
        `INSERT INTO context_cache_summaries
         (root, id, kind, path, source_hash, summary, estimated_tokens, reason_codes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const summary of snapshot.summaries ?? []) {
        insertSummary.run(
          root,
          summary.id,
          summary.kind,
          summary.path,
          summary.sourceHash,
          summary.summary,
          summary.estimatedTokens,
          JSON.stringify(summary.reasonCodes),
          updatedAt,
        );
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }
}
