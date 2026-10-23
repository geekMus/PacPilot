import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { AppSettings, GenerationMode } from "./settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "./settings";
import { initializeSchema } from "./schema";
export * from "./workflows";

/** Bun 内置 SQLite 连接类型 */
export type AppDatabase = Database;

let db: AppDatabase | null = null;

export function createDatabase(dataDir: string): AppDatabase {
  const inMemory = dataDir === ":memory:";
  if (!inMemory) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = inMemory ? dataDir : path.join(dataDir, "database.db");
  const database = new Database(dbPath, { create: true });
  try {
    database.run("PRAGMA journal_mode = WAL;");
    database.run("PRAGMA foreign_keys = ON;");
    initializeSchema(database, () => setSettings(database, DEFAULT_SETTINGS));
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
): { generationLogs: number; accessEvents: number } {
  if (retentionDays <= 0) return { generationLogs: 0, accessEvents: 0 };
  const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
  // generation_log.created_at uses SQLite's UTC "YYYY-MM-DD HH:mm:ss" format;
  // Access-event timestamps use ISO 8601.
  const cutoffIso = cutoffDate.toISOString();
  const cutoffSql = cutoffIso.slice(0, 19).replace("T", " ");
  const generationLogs = Number(
    database.query("DELETE FROM generation_log WHERE created_at < ?").run(cutoffSql).changes
  );
  const accessEvents = Number(
    database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoffIso).changes
  );
  return { generationLogs, accessEvents };
}
/** Delete operational logs without touching workflow execution history. */
export function clearOperationalLogs(database: AppDatabase): {
  generationLogs: number;
  accessEvents: number;
} {
  database.run("BEGIN IMMEDIATE");
  try {
    const generationLogs = Number(database.query("DELETE FROM generation_log").run().changes);
    const accessEvents = Number(database.query("DELETE FROM access_events").run().changes);
    database.run("COMMIT");
    return { generationLogs, accessEvents };
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
      COALESCE((SELECT SUM(length(path) + length(category) + length(source_ip) + length(user_agent) + 96) FROM access_events),0)
      AS bytes
  `
    )
    .get() as { bytes: number };
  return Number(row.bytes || 0);
}


/** Storage queries used by HTTP handlers; SQL remains confined to the persistence module. */
export function getOperationalCounts(database: AppDatabase): {
  generationLogs: number;
  accessEvents: number;
  workflows: number;
  activeWorkflows: number;
} {
  const row = database.query(
    "SELECT (SELECT COUNT(*) FROM generation_log) AS generationLogs, " +
      "(SELECT COUNT(*) FROM access_events) AS accessEvents, " +
      "(SELECT COUNT(*) FROM workflow_runs) AS workflows, " +
      "(SELECT COUNT(*) FROM workflow_runs WHERE status IN ('pending','running')) AS activeWorkflows"
  ).get() as { generationLogs: number; accessEvents: number; workflows: number; activeWorkflows: number };
  return {
    generationLogs: Number(row.generationLogs),
    accessEvents: Number(row.accessEvents),
    workflows: Number(row.workflows),
    activeWorkflows: Number(row.activeWorkflows),
  };
}

export function countGenerationLogs(database: AppDatabase): number {
  return Number((database.query("SELECT COUNT(*) AS total FROM generation_log").get() as { total: number }).total);
}

export function countWorkflowRuns(database: AppDatabase): number {
  return Number((database.query("SELECT COUNT(*) AS total FROM workflow_runs").get() as { total: number }).total);
}

export function countAccessEvents(database: AppDatabase): number {
  return Number((database.query("SELECT COUNT(*) AS total FROM access_events").get() as { total: number }).total);
}

export function vacuumDatabase(database: AppDatabase, truncateWal = false): void {
  if (truncateWal) database.run("PRAGMA wal_checkpoint(TRUNCATE);");
  database.run("VACUUM;");
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
