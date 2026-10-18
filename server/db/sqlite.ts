import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { AppSettings, GenerationMode } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";

/** Bun 内置 SQLite 连接类型 */
export type AppDatabase = Database;

let db: AppDatabase | null = null;

export function getDb(dataDir: string): AppDatabase {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "genpac.db");
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(database: AppDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      success    INTEGER NOT NULL,
      mode       TEXT NOT NULL,
      message    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = database
    .query("SELECT value FROM settings WHERE key = ?")
    .get("config") as { value: string } | null;

  if (!row) {
    setSettings(database, DEFAULT_SETTINGS);
  }
}

export function getSettings(database: AppDatabase = db!): AppSettings {
  const row = database
    .query("SELECT value FROM settings WHERE key = ?")
    .get("config") as { value: string } | null;

  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(
  database: AppDatabase,
  settings: AppSettings
): void {
  const normalized = normalizeSettings(settings);
  database
    .query(
      `INSERT INTO settings (key, value) VALUES ('config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(JSON.stringify(normalized));
}

export function updateSettings(
  database: AppDatabase,
  patch: Partial<AppSettings>
): AppSettings {
  const current = getSettings(database);
  const next = normalizeSettings({ ...current, ...patch });
  setSettings(database, next);
  return next;
}

export function appendGenerationLog(
  database: AppDatabase,
  success: boolean,
  mode: GenerationMode,
  message: string
): void {
  database
    .query(
      `INSERT INTO generation_log (success, mode, message) VALUES (?, ?, ?)`
    )
    .run(success ? 1 : 0, mode, message);
}

export function recentLogs(
  database: AppDatabase,
  limit = 20
): Array<{
  id: number;
  success: boolean;
  mode: string;
  message: string | null;
  created_at: string;
}> {
  const rows = database
    .query(
      `SELECT id, success, mode, message, created_at
       FROM generation_log
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    success: number;
    mode: string;
    message: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    success: Boolean(r.success),
    mode: r.mode,
    message: r.message,
    created_at: r.created_at,
  }));
}

function normalizeSettings(
  s: AppSettings & { gfwlistUrl?: string; mode?: string }
): AppSettings {
  const rawMode = String(s.mode || "");
  const mode: GenerationMode =
    rawMode === "remote" || rawMode === "genpac" ? "remote" : "custom";

  return {
    mode,
    pacProxy: String(s.pacProxy || DEFAULT_SETTINGS.pacProxy).trim(),
    pacCompress: Boolean(s.pacCompress),
    pacPrecise: Boolean(s.pacPrecise),
    listUrl: String(s.listUrl || s.gfwlistUrl || "").trim(),
    blockList: Array.isArray(s.blockList)
      ? s.blockList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    directList: Array.isArray(s.directList)
      ? s.directList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    cronSchedule: String(s.cronSchedule || "").trim(),
    webhookSuccessUrl: String(s.webhookSuccessUrl || "").trim(),
    webhookSuccessBody: String(s.webhookSuccessBody || "").trim(),
    webhookFailureUrl: String(s.webhookFailureUrl || "").trim(),
    webhookFailureBody: String(s.webhookFailureBody || "").trim(),
  };
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
