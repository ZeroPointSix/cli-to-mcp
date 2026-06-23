/**
 * SQLite-backed Cache Store (architecture §5.8).
 *
 * Uses Node's built-in `node:sqlite` (experimental in Node 22/24) so the
 * runtime has zero native compile dependencies — important on Windows hosts
 * without Visual Studio. API mirrors better-sqlite3 closely, except that
 * `node:sqlite` has no `.transaction()` helper, so we wrap BEGIN/COMMIT
 * manually.
 *
 * Phase 1 scope:
 * - connectors / tools / scan_runs / commands (raw discovery artifact)
 * - load tools by configHash; write fresh results atomically on refresh
 * - refresh failure never deletes old rows (callers must not call clear on failure)
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { ToolDefinition } from "../registry/tool-definition.js";

// `node:sqlite` is experimental; load it at runtime so toolchains that don't
// understand the `node:` protocol don't try to resolve `sqlite` as a package.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DatabaseSync } = require("node:sqlite") as any;

type Statement = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(...params: any[]): { lastInsertRowid: bigint | number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(...params: any[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(...params: any[]): any[];
};
type DatabaseSyncLike = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};

export type ConnectorRow = {
  name: string;
  binary: string;
  enabled: number;
  version: string | null;
  config_hash: string;
  created_at: string;
  updated_at: string;
};

export type ScanRunStatus = "running" | "ok" | "failed";

export type ScanRunRow = {
  id: number;
  connector_name: string;
  status: ScanRunStatus;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export type ToolRow = {
  name: string;
  connector_name: string;
  definition_json: string;
  source: string;
  config_hash: string;
  updated_at: string;
};

export type CommandRow = {
  id: number;
  connector_name: string;
  path: string;
  raw_help: string;
  parsed_json: string | null;
  scan_run_id: number | null;
};

export class CacheStore {
  private db: DatabaseSyncLike;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath) as DatabaseSyncLike;
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  /** Run `fn` inside a transaction. Rolls back on throw. */
  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connectors (
        name TEXT PRIMARY KEY,
        binary TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        version TEXT,
        config_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scan_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connector_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connector_name TEXT NOT NULL,
        path TEXT NOT NULL,
        raw_help TEXT NOT NULL,
        parsed_json TEXT,
        scan_run_id INTEGER
      );

      CREATE TABLE IF NOT EXISTS tools (
        name TEXT NOT NULL,
        connector_name TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        source TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (config_hash, name)
      );

      CREATE INDEX IF NOT EXISTS idx_commands_connector ON commands(connector_name);
      CREATE INDEX IF NOT EXISTS idx_scanruns_connector ON scan_runs(connector_name);
    `);
    this.migrateToolsPrimaryKey();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tools_connector ON tools(connector_name);
      CREATE INDEX IF NOT EXISTS idx_tools_hash ON tools(config_hash);
    `);
  }

  /** Upgrade legacy tools(name) PK to (config_hash, name) for per-hash isolation. */
  private migrateToolsPrimaryKey(): void {
    const columns = this.db.prepare(`PRAGMA table_info(tools)`).all() as Array<{
      name: string;
      pk: number;
    }>;
    const nameCol = columns.find((c) => c.name === "name");
    const hashCol = columns.find((c) => c.name === "config_hash");
    if (nameCol?.pk === 2 && hashCol?.pk === 1) return;
    if (columns.length === 0) return;
    this.tx(() => {
      this.db.exec(`
        CREATE TABLE tools_new (
          name TEXT NOT NULL,
          connector_name TEXT NOT NULL,
          definition_json TEXT NOT NULL,
          source TEXT NOT NULL,
          config_hash TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (config_hash, name)
        );
        INSERT OR REPLACE INTO tools_new (name, connector_name, definition_json, source, config_hash, updated_at)
          SELECT name, connector_name, definition_json, source, config_hash, updated_at FROM tools;
        DROP TABLE tools;
        ALTER TABLE tools_new RENAME TO tools;
      `);
    });
  }

  // ---- connectors ----

  upsertConnector(c: Omit<ConnectorRow, "created_at" | "updated_at">): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO connectors (name, binary, enabled, version, config_hash, created_at, updated_at)
         VALUES (@name, @binary, @enabled, @version, @config_hash, @created_at, @updated_at)
         ON CONFLICT(name) DO UPDATE SET
           binary=excluded.binary,
           enabled=excluded.enabled,
           version=excluded.version,
           config_hash=excluded.config_hash,
           updated_at=excluded.updated_at`,
      )
      .run({ ...c, created_at: now, updated_at: now });
  }

  getConnector(name: string): ConnectorRow | undefined {
    return this.db.prepare(`SELECT * FROM connectors WHERE name = ?`).get(name) as
      | ConnectorRow
      | undefined;
  }

  // ---- scan_runs ----

  startScanRun(connectorName: string): number {
    const startedAt = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO scan_runs (connector_name, status, started_at) VALUES (?, 'running', ?)`,
      )
      .run(connectorName, startedAt);
    return Number(info.lastInsertRowid);
  }

  finishScanRun(id: number, status: ScanRunStatus, error: string | null): void {
    this.db
      .prepare(
        `UPDATE scan_runs SET status = ?, finished_at = ?, error = ? WHERE id = ?`,
      )
      .run(status, new Date().toISOString(), error, id);
  }

  latestScanRun(connectorName: string): ScanRunRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM scan_runs WHERE connector_name = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(connectorName) as ScanRunRow | undefined;
  }

  // ---- commands (raw discovery artifacts) ----

  replaceCommands(
    connectorName: string,
    scanRunId: number,
    rows: Array<{ path: string; raw_help: string; parsed_json: string | null }>,
  ): void {
    const del = this.db.prepare(`DELETE FROM commands WHERE connector_name = ?`);
    const ins = this.db.prepare(
      `INSERT INTO commands (connector_name, path, raw_help, parsed_json, scan_run_id)
       VALUES (@connector_name, @path, @raw_help, @parsed_json, @scan_run_id)`,
    );
    this.tx(() => {
      del.run(connectorName);
      for (const r of rows) {
        ins.run({
          connector_name: connectorName,
          path: r.path,
          raw_help: r.raw_help,
          parsed_json: r.parsed_json,
          scan_run_id: scanRunId,
        });
      }
    });
  }

  getCommands(connectorName: string): CommandRow[] {
    return this.db
      .prepare(`SELECT * FROM commands WHERE connector_name = ? ORDER BY id`)
      .all(connectorName) as CommandRow[];
  }

  // ---- tools ----

  /**
   * Atomically replace all tools for a given configHash. Old tools with a
   * DIFFERENT configHash are retained so refresh failure can fall back to them.
   */
  replaceTools(configHash: string, tools: ToolDefinition[]): void {
    const del = this.db.prepare(`DELETE FROM tools WHERE config_hash = ?`);
    const ins = this.db.prepare(
      `INSERT INTO tools (name, connector_name, definition_json, source, config_hash, updated_at)
       VALUES (@name, @connector_name, @definition_json, @source, @config_hash, @updated_at)`,
    );
    this.tx(() => {
      del.run(configHash);
      const now = new Date().toISOString();
      for (const t of tools) {
        ins.run({
          name: t.name,
          connector_name: t.connectorName,
          definition_json: JSON.stringify(t),
          source: t.source,
          config_hash: configHash,
          updated_at: now,
        });
      }
    });
  }

  loadTools(configHash: string): ToolDefinition[] {
    const rows = this.db
      .prepare(`SELECT definition_json FROM tools WHERE config_hash = ?`)
      .all(configHash) as { definition_json: string }[];
    return rows.map((r) => JSON.parse(r.definition_json) as ToolDefinition);
  }

  loadLatestTools(): ToolDefinition[] {
    const latest = this.db
      .prepare(
        `SELECT config_hash FROM tools ORDER BY updated_at DESC LIMIT 1`,
      )
      .get() as { config_hash: string } | undefined;
    if (!latest) return [];
    return this.loadTools(latest.config_hash);
  }

  getTool(name: string): ToolDefinition | undefined {
    const row = this.db
      .prepare(`SELECT definition_json FROM tools WHERE name = ?`)
      .get(name) as { definition_json: string } | undefined;
    return row ? (JSON.parse(row.definition_json) as ToolDefinition) : undefined;
  }

  hasToolsForHash(configHash: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM tools WHERE config_hash = ? LIMIT 1`)
      .get(configHash);
    return !!row;
  }
}
