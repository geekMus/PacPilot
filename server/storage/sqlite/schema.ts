import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 4;

export function initializeSchema(database: Database, ensureDefaultSettings: () => void): void {
  const version = Number(
    (database.query("PRAGMA user_version").get() as { user_version: number }).user_version
  );
  const hasTables = Boolean(
    database.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()
  );

  if (hasTables) {
    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version mismatch: expected ${CURRENT_SCHEMA_VERSION}, found ${version}. ` +
          "Delete the data directory and restart to recreate the database."
      );
    }
  } else if (version !== 0) {
    throw new Error(`Database schema version ${version} is set, but the settings table is missing.`);
  }

  database.run("BEGIN IMMEDIATE");
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
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

      CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_access_events_source_created ON access_events(source_ip, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_stages_run ON workflow_stages(run_id, id);
    `);

    const row = database.query("SELECT value FROM settings WHERE key = ?").get("config") as {
      value: string;
    } | null;

    if (!row) ensureDefaultSettings();

    database.run("PRAGMA user_version = " + CURRENT_SCHEMA_VERSION + ";");
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
