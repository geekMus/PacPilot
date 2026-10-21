import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { AppSettings, GenerationMode } from "./settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "./settings";
export * from "./workflows";

/** Bun 内置 SQLite 连接类型 */
export type AppDatabase = Database;

let db: AppDatabase | null = null;

export function createDatabase(dataDir: string): AppDatabase {
  const inMemory = dataDir === ":memory:";
  if (!inMemory) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = inMemory ? dataDir : path.join(dataDir, "genpac.db");
  const database = new Database(dbPath, { create: true });
  try {
    database.run("PRAGMA journal_mode = WAL;");
    database.run("PRAGMA foreign_keys = ON;");
    initializeSchema(database);
    return database;
  } catch (error) {
    try {
      database.close();
    } catch {
      /* initialization may already have closed the connection */
    }
    throw error;
  }
}

export function getDb(dataDir: string): AppDatabase {
  if (db) return db;
  db = createDatabase(dataDir);
  return db;
}

function initializeSchema(database: AppDatabase): void {
  const version = Number(
    (database.query("PRAGMA user_version").get() as { user_version: number }).user_version
  );
  const hasTables = Boolean(
    database.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()
  );
  // Version 0 includes legacy databases that predate user_version tracking.
  // Migrate those in place; never require users to delete their existing database.
  if (version > 2 || version < 0) {
    throw new Error(`Unsupported database schema version: ${version}`);
  }
  if (!hasTables && version !== 0) {
    throw new Error(
      `Database schema version ${version} is set, but the settings table is missing.`
    );
  }

  database.run("BEGIN IMMEDIATE");
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        success    INTEGER NOT NULL,
        mode       TEXT NOT NULL,
        result_code TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS access_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        category TEXT NOT NULL,
        source_ip TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        status_code INTEGER NOT NULL,
        duration_ms REAL NOT NULL DEFAULT 0,
        response_bytes INTEGER NOT NULL DEFAULT 0,
        query_string TEXT NOT NULL DEFAULT '',
        host TEXT NOT NULL DEFAULT '',
        referer TEXT NOT NULL DEFAULT '',
        accept TEXT NOT NULL DEFAULT '',
        accept_language TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT '',
        request_headers TEXT NOT NULL DEFAULT '',
        response_content_type TEXT NOT NULL DEFAULT ''
      );



      CREATE TABLE IF NOT EXISTS proxy_probe_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tested_at TEXT NOT NULL,
        proxy_label TEXT NOT NULL,
        proxy_host TEXT NOT NULL,
        proxy_port INTEGER NOT NULL,
        target_host TEXT NOT NULL,
        success INTEGER NOT NULL,
        tcp_ms REAL,
        handshake_ms REAL,
        target_ms REAL,
        http_status INTEGER,
        phase TEXT NOT NULL,
        error_code TEXT NOT NULL DEFAULT '',
        error_detail TEXT NOT NULL DEFAULT ''
      );



      CREATE TABLE IF NOT EXISTS workflow_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER
      );



      CREATE TABLE IF NOT EXISTS workflow_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        stage_key TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER
      );

    `);

    // Add columns introduced after the original schema without dropping any rows.
    // Definitions use constant defaults because SQLite restricts ALTER TABLE defaults.
    const ensureColumn = (table: string, column: string, definition: string) => {
      const columns = database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!columns.some((item) => item.name === column)) {
        database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    const migrations: Record<string, Array<[string, string]>> = {
      generation_log: [
        ["success", "INTEGER NOT NULL DEFAULT 0"],
        ["mode", "TEXT NOT NULL DEFAULT 'custom'"],
        ["result_code", "TEXT NOT NULL DEFAULT ''"],
        ["detail", "TEXT NOT NULL DEFAULT '{}'"],
        ["error", "TEXT NOT NULL DEFAULT ''"],
        ["created_at", "TEXT NOT NULL DEFAULT ''"],
      ],
      access_events: [
        ["created_at", "TEXT NOT NULL DEFAULT ''"], ["method", "TEXT NOT NULL DEFAULT ''"],
        ["path", "TEXT NOT NULL DEFAULT ''"], ["category", "TEXT NOT NULL DEFAULT ''"],
        ["source_ip", "TEXT NOT NULL DEFAULT ''"], ["user_agent", "TEXT NOT NULL DEFAULT ''"],
        ["status_code", "INTEGER NOT NULL DEFAULT 0"], ["duration_ms", "REAL NOT NULL DEFAULT 0"],
        ["response_bytes", "INTEGER NOT NULL DEFAULT 0"], ["query_string", "TEXT NOT NULL DEFAULT ''"],
        ["host", "TEXT NOT NULL DEFAULT ''"], ["referer", "TEXT NOT NULL DEFAULT ''"],
        ["accept", "TEXT NOT NULL DEFAULT ''"], ["accept_language", "TEXT NOT NULL DEFAULT ''"],
        ["content_type", "TEXT NOT NULL DEFAULT ''"], ["request_headers", "TEXT NOT NULL DEFAULT ''"],
        ["response_content_type", "TEXT NOT NULL DEFAULT ''"],
      ],
      proxy_probe_runs: [
        ["tested_at", "TEXT NOT NULL DEFAULT ''"], ["proxy_label", "TEXT NOT NULL DEFAULT ''"],
        ["proxy_host", "TEXT NOT NULL DEFAULT ''"], ["proxy_port", "INTEGER NOT NULL DEFAULT 0"],
        ["target_host", "TEXT NOT NULL DEFAULT ''"], ["success", "INTEGER NOT NULL DEFAULT 0"],
        ["tcp_ms", "REAL"], ["handshake_ms", "REAL"], ["target_ms", "REAL"],
        ["http_status", "INTEGER"], ["phase", "TEXT NOT NULL DEFAULT ''"],
        ["error_code", "TEXT NOT NULL DEFAULT ''"], ["error_detail", "TEXT NOT NULL DEFAULT ''"],
      ],
      workflow_runs: [
        ["source", "TEXT NOT NULL DEFAULT 'manual'"], ["status", "TEXT NOT NULL DEFAULT 'failed'"],
        ["stage", "TEXT NOT NULL DEFAULT ''"], ["mode", "TEXT NOT NULL DEFAULT 'custom'"],
        ["error", "TEXT NOT NULL DEFAULT ''"], ["created_at", "TEXT NOT NULL DEFAULT ''"],
        ["started_at", "TEXT"], ["finished_at", "TEXT"], ["duration_ms", "INTEGER"],
      ],
      workflow_stages: [
        ["run_id", "INTEGER NOT NULL DEFAULT 0"], ["stage_key", "TEXT NOT NULL DEFAULT ''"],
        ["status", "TEXT NOT NULL DEFAULT 'skipped'"], ["error", "TEXT NOT NULL DEFAULT ''"],
        ["detail", "TEXT NOT NULL DEFAULT ''"], ["started_at", "TEXT"],
        ["finished_at", "TEXT"], ["duration_ms", "INTEGER"],
      ],
    };

    for (const [table, columns] of Object.entries(migrations)) {
      for (const [column, definition] of columns) ensureColumn(table, column, definition);
    }

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_access_events_source_created ON access_events(source_ip, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_proxy_probe_tested_at ON proxy_probe_runs(tested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_proxy_probe_label_tested ON proxy_probe_runs(proxy_label, tested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_stages_run ON workflow_stages(run_id, id);
    `);

    // Old rows may have received an empty placeholder during an additive migration.
    database.run("UPDATE generation_log SET created_at = datetime('now') WHERE created_at = ''");
    database.run("UPDATE access_events SET created_at = datetime('now') WHERE created_at = ''");
    database.run("UPDATE proxy_probe_runs SET tested_at = datetime('now') WHERE tested_at = ''");
    database.run("UPDATE workflow_runs SET created_at = datetime('now') WHERE created_at = ''");

    const row = database.query("SELECT value FROM settings WHERE key = ?").get("config") as {
      value: string;
    } | null;

    if (!row) {
      setSettings(database, DEFAULT_SETTINGS);
    }

    database.run("PRAGMA user_version = 2;");
    database.run("COMMIT");
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      /* transaction may already be closed */
    }
    throw error;
  }
}

export function getSettings(database: AppDatabase = db!): AppSettings {
  const row = database.query("SELECT value FROM settings WHERE key = ?").get("config") as {
    value: string;
  } | null;

  if (!row) throw new Error("Application settings are not initialized in the database.");

  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Stored application settings must be a JSON object.");
    }
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch (error) {
    throw new Error(
      `Failed to read application settings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function setSettings(database: AppDatabase, settings: AppSettings): void {
  const normalized = normalizeSettings(settings);
  database
    .query(
      `INSERT INTO settings (key, value) VALUES ('config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(JSON.stringify(normalized));
}

export function updateSettings(database: AppDatabase, patch: Partial<AppSettings>): AppSettings {
  const current = getSettings(database);
  const next = normalizeSettings({ ...current, ...patch });
  setSettings(database, next);
  return next;
}

export function appendGenerationLog(
  database: AppDatabase,
  success: boolean,
  mode: GenerationMode,
  resultCode: string,
  detail: Record<string, string | number | boolean> = {},
  error = ""
): void {
  database
    .query(
      `INSERT INTO generation_log (success, mode, result_code, detail, error) VALUES (?, ?, ?, ?, ?)`
    )
    .run(success ? 1 : 0, mode, resultCode, JSON.stringify(detail), error);
}

function parseRecord(value: string): Record<string, string | number | boolean> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored generation log detail must be a JSON object.");
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      result[key] = entry;
    }
  }
  return result;
}

export function recentLogs(
  database: AppDatabase,
  limit = 20,
  offset = 0,
  beforeId = 0
): Array<{
  id: number;
  success: boolean;
  mode: string;
  result_code: string;
  detail: Record<string, string | number | boolean>;
  error: string;
  created_at: string;
}> {
  const safeLimit = Math.max(1, Math.min(101, Math.trunc(limit) || 20));
  const cursor = Math.max(0, Math.trunc(beforeId) || 0);
  const rows = (
    cursor > 0
      ? database
          .query(
            "SELECT id, success, mode, result_code, detail, error, created_at FROM generation_log WHERE id < ? ORDER BY id DESC LIMIT ?"
          )
          .all(cursor, safeLimit)
      : database
          .query(
            "SELECT id, success, mode, result_code, detail, error, created_at FROM generation_log ORDER BY id DESC LIMIT ? OFFSET ?"
          )
          .all(safeLimit, Math.max(0, Math.trunc(offset) || 0))
  ) as Array<{
    id: number;
    success: number;
    mode: string;
    result_code: string;
    detail: string;
    error: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    success: Boolean(r.success),
    mode: r.mode,
    result_code: r.result_code,
    detail: parseRecord(r.detail),
    error: r.error,
    created_at: r.created_at.replace(" ", "T") + "Z",
  }));
}

function normalizeTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return value.trim();
  } catch {
    return DEFAULT_SETTINGS.timezone;
  }
}
function normalizeSettings(s: AppSettings): AppSettings {
  return {
    mode: s.mode === "remote" ? "remote" : "custom",
    pacProxy: String(s.pacProxy || DEFAULT_SETTINGS.pacProxy).trim(),
    pacCompress: Boolean(s.pacCompress),
    listUrl: String(s.listUrl || "").trim(),
    blockList: Array.isArray(s.blockList)
      ? s.blockList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    directList: Array.isArray(s.directList)
      ? s.directList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    cronSchedule: String(s.cronSchedule || "").trim(),
    timezone: normalizeTimeZone(String(s.timezone || DEFAULT_SETTINGS.timezone)),
    proxyTestUrl: String(s.proxyTestUrl || DEFAULT_SETTINGS.proxyTestUrl).trim(),
    logRetentionDays: Math.max(
      0,
      Math.min(
        3650,
        Math.floor(Number(s.logRetentionDays ?? DEFAULT_SETTINGS.logRetentionDays) || 0)
      )
    ),
    webhookSuccessConfig: normalizeWebhookConfig(s.webhookSuccessConfig),
    webhookFailureConfig: normalizeWebhookConfig(s.webhookFailureConfig),
  };
}

export function cleanupOperationalLogs(
  database: AppDatabase,
  retentionDays = getSettings(database).logRetentionDays
): { generationLogs: number; accessEvents: number; proxyProbeRuns: number } {
  if (retentionDays <= 0) return { generationLogs: 0, accessEvents: 0, proxyProbeRuns: 0 };
  const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
  // generation_log.created_at uses SQLite's UTC "YYYY-MM-DD HH:mm:ss" format;
  // access/probe timestamps use ISO 8601. Compare each table in its stored format.
  const cutoffIso = cutoffDate.toISOString();
  const cutoffSql = cutoffIso.slice(0, 19).replace("T", " ");
  const generationLogs = Number(
    database.query("DELETE FROM generation_log WHERE created_at < ?").run(cutoffSql).changes
  );
  const accessEvents = Number(
    database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoffIso).changes
  );
  const proxyProbeRuns = Number(
    database.query("DELETE FROM proxy_probe_runs WHERE tested_at < ?").run(cutoffIso).changes
  );
  return { generationLogs, accessEvents, proxyProbeRuns };
}
/** Delete operational logs without touching workflow execution history. */
export function clearOperationalLogs(database: AppDatabase): {
  generationLogs: number;
  accessEvents: number;
  proxyProbeRuns: number;
} {
  database.run("BEGIN IMMEDIATE");
  try {
    const generationLogs = Number(database.query("DELETE FROM generation_log").run().changes);
    const accessEvents = Number(database.query("DELETE FROM access_events").run().changes);
    const proxyProbeRuns = Number(database.query("DELETE FROM proxy_probe_runs").run().changes);
    database.run("COMMIT");
    return { generationLogs, accessEvents, proxyProbeRuns };
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      /* transaction may already be closed */
    }
    throw error;
  }
}

export function operationalLogStorageBytes(database: AppDatabase): number {
  const row = database
    .query(
      `
    SELECT
      COALESCE((SELECT SUM(length(result_code) + length(detail) + length(error) + length(mode) + 48) FROM generation_log),0) +
      COALESCE((SELECT SUM(length(path) + length(category) + length(source_ip) + length(user_agent) + 96) FROM access_events),0) +
      COALESCE((SELECT SUM(length(proxy_label) + length(proxy_host) + length(target_host) + length(error_code) + length(error_detail) + 96) FROM proxy_probe_runs),0)
      AS bytes
  `
    )
    .get() as { bytes: number };
  return Number(row.bytes || 0);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
