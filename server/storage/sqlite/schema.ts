import type { Database } from "bun:sqlite";

/** SQLite schema migrations are additive and run atomically at startup. */
export const CURRENT_SCHEMA_VERSION = 4;

export function initializeSchema(database: Database, ensureDefaultSettings: () => void): void {
  const version = Number(
    (database.query("PRAGMA user_version").get() as { user_version: number }).user_version
  );
  const hasTables = Boolean(
    database.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()
  );
  // Version 0 includes legacy databases that predate user_version tracking.
  // Migrate those in place; never require users to delete their existing database.
  if (version > CURRENT_SCHEMA_VERSION || version < 0) {
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

    `);

    // Add columns introduced after the original schema without dropping any rows.
    // Definitions use constant defaults because SQLite restricts ALTER TABLE defaults.
    const ensureColumn = (table: string, column: string, definition: string) => {
      const columns = database.query(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
      }>;
      if (!columns.some((item) => item.name === column)) {
        database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };

    const migrations: Record<string, Array<[string, string]>> = {
      access_events: [
        ["created_at", "TEXT NOT NULL DEFAULT ''"],
        ["method", "TEXT NOT NULL DEFAULT ''"],
        ["path", "TEXT NOT NULL DEFAULT ''"],
        ["category", "TEXT NOT NULL DEFAULT ''"],
        ["source_ip", "TEXT NOT NULL DEFAULT ''"],
        ["user_agent", "TEXT NOT NULL DEFAULT ''"],
        ["status_code", "INTEGER NOT NULL DEFAULT 0"],
        ["duration_ms", "REAL NOT NULL DEFAULT 0"],
        ["response_bytes", "INTEGER NOT NULL DEFAULT 0"],
        ["query_string", "TEXT NOT NULL DEFAULT ''"],
        ["host", "TEXT NOT NULL DEFAULT ''"],
        ["referer", "TEXT NOT NULL DEFAULT ''"],
        ["accept", "TEXT NOT NULL DEFAULT ''"],
        ["accept_language", "TEXT NOT NULL DEFAULT ''"],
        ["content_type", "TEXT NOT NULL DEFAULT ''"],
        ["request_headers", "TEXT NOT NULL DEFAULT ''"],
        ["response_content_type", "TEXT NOT NULL DEFAULT ''"],
      ],
      workflow_runs: [
        ["source", "TEXT NOT NULL DEFAULT 'manual'"],
        ["status", "TEXT NOT NULL DEFAULT 'failed'"],
        ["stage", "TEXT NOT NULL DEFAULT ''"],
        ["mode", "TEXT NOT NULL DEFAULT 'custom'"],
        ["error", "TEXT NOT NULL DEFAULT ''"],
        ["created_at", "TEXT NOT NULL DEFAULT ''"],
        ["started_at", "TEXT"],
        ["finished_at", "TEXT"],
        ["duration_ms", "INTEGER"],
      ],
      workflow_stages: [
        ["run_id", "INTEGER NOT NULL DEFAULT 0"],
        ["stage_key", "TEXT NOT NULL DEFAULT ''"],
        ["status", "TEXT NOT NULL DEFAULT 'skipped'"],
        ["error", "TEXT NOT NULL DEFAULT ''"],
        ["detail", "TEXT NOT NULL DEFAULT ''"],
        ["started_at", "TEXT"],
        ["finished_at", "TEXT"],
        ["duration_ms", "INTEGER"],
      ],
    };

    for (const [table, columns] of Object.entries(migrations)) {
      for (const [column, definition] of columns) ensureColumn(table, column, definition);
    }

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_access_events_source_created ON access_events(source_ip, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_stages_run ON workflow_stages(run_id, id);
    `);

    // Old rows may have received an empty placeholder during an additive migration.
    database.run("UPDATE access_events SET created_at = datetime('now') WHERE created_at = ''");
    // Version 3 removes the retired proxy connectivity feature and its stored history.
    if (version < 3) database.run("DROP TABLE IF EXISTS proxy_probe_runs");
    // Version 4 removes the generation-log feature; PAC is now served from /pac
    // and workflow history in workflow_runs carries execution results instead.
    if (version < 4) database.run("DROP TABLE IF EXISTS generation_log");
    database.run("UPDATE workflow_runs SET created_at = datetime('now') WHERE created_at = ''");

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
