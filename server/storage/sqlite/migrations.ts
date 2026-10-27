import type { AppDatabase } from "./database";
import { BASELINE_SCHEMA_SQL, BASELINE_SCHEMA_VERSION } from "./schema";
import { createMigrationBackup } from "./backup";
import { runtimeLog } from "../../utils/runtime-log";

export interface SqliteMigration {
  /**
   * Absolute schema version recorded in `PRAGMA user_version`. The chain starts
   * at the v4 baseline and every entry's version is exactly previous + 1.
   */
  version: number;
  description: string;
  up: (database: AppDatabase, helpers: SqliteMigrationHelpers) => void;
}

export interface SqliteMigrationHelpers {
  /** Filesystem data directory; null for `:memory:` databases, which must not touch files. */
  dataDir: string | null;
  /** Writes the default application settings row; used by the baseline migration on empty databases. */
  ensureDefaultSettings: () => void;
}

const migrationV4Baseline: SqliteMigration = {
  version: BASELINE_SCHEMA_VERSION,
  description: "baseline schema (settings, access_events, workflow_runs, workflow_stages)",
  up(database, { ensureDefaultSettings }) {
    database.run(BASELINE_SCHEMA_SQL);
    const hasConfig = database.query("SELECT 1 FROM settings WHERE key = ?").get("config");
    if (!hasConfig) ensureDefaultSettings();
  },
};

/**
 * Drops the redundant `schemaVersion` fields (document level and per event) that
 * nothing ever read; `PRAGMA user_version` is the single schema version axis now.
 * Corrupt or unexpected JSON aborts the migration instead of dropping data.
 */
function stripNotificationsSchemaVersion(database: AppDatabase): void {
  const row = database.query("SELECT value FROM settings WHERE key = ?").get("notifications") as {
    value: string;
  } | null;
  if (!row) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch (error) {
    throw new Error(
      `The notifications record is not valid JSON and cannot be upgraded safely: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The notifications record must be a JSON object to be upgraded safely.");
  }
  const document = parsed as Record<string, unknown>;
  delete document.schemaVersion;
  if (Array.isArray(document.events)) {
    for (const event of document.events) {
      if (event && typeof event === "object" && !Array.isArray(event)) {
        delete (event as Record<string, unknown>).schemaVersion;
      }
    }
  }
  database
    .query("UPDATE settings SET value = ? WHERE key = ?")
    .run(JSON.stringify(document), "notifications");
}

const migrationV5NotificationSchemaVersion: SqliteMigration = {
  version: 5,
  description: "drop redundant schemaVersion fields from the notifications document",
  up(database) {
    stripNotificationsSchemaVersion(database);
  },
};

/**
 * Append-only, forward-only startup migration chain. Published entries are
 * immutable: never edit or remove them; always append with version = previous + 1.
 * See AGENTS.md and docs/storage-adapter-contract.md for the change rules.
 */
export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [
  migrationV4Baseline,
  migrationV5NotificationSchemaVersion,
];

export interface EnsureSchemaOptions extends SqliteMigrationHelpers {
  /** Tests may inject a custom chain; production always uses SQLITE_MIGRATIONS. */
  migrations?: readonly SqliteMigration[];
}

function readUserVersion(database: AppDatabase): number {
  return Number(
    (database.query("PRAGMA user_version").get() as { user_version: number }).user_version
  );
}

function applyMigration(
  database: AppDatabase,
  migration: SqliteMigration,
  helpers: SqliteMigrationHelpers
): void {
  database.run("BEGIN IMMEDIATE");
  try {
    migration.up(database, helpers);
    // The version bump lives in the same transaction as the change, so a failed
    // migration rolls back both and never leaves a half-upgraded database.
    database.run(`PRAGMA user_version = ${migration.version};`);
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

/**
 * Brings the database to the latest schema version at startup. Fresh databases
 * replay the whole chain; older supported databases run only the pending
 * migrations after a `VACUUM INTO` backup; unsupported states (newer than this
 * build, or older than the v4 baseline) refuse to start.
 */
export function ensureSchema(database: AppDatabase, options: EnsureSchemaOptions): void {
  const migrations = options.migrations ?? SQLITE_MIGRATIONS;
  if (migrations.length === 0) throw new Error("The migration chain must not be empty.");
  const baselineVersion = migrations[0]!.version;
  const latestVersion = migrations[migrations.length - 1]!.version;
  const version = readUserVersion(database);
  const hasTables = Boolean(
    database.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()
  );

  if (!hasTables) {
    if (version !== 0) {
      throw new Error(
        `Database schema version ${version} is set, but the settings table is missing.`
      );
    }
    // Fresh database: replaying the full chain keeps fresh installs and upgraded
    // databases on one code path with a provably identical end state.
    for (const migration of migrations) applyMigration(database, migration, options);
    return;
  }

  if (version === 0) {
    throw new Error(
      "The settings table exists but no schema version is recorded; this database predates schema versioning. See docs/deployment.md."
    );
  }
  if (version > latestVersion) {
    throw new Error(
      `Database schema version ${version} is newer than this build supports (v${latestVersion}); upgrade to a newer PacPilot release instead of rolling back.`
    );
  }
  if (version < baselineVersion) {
    throw new Error(
      `Database schema version ${version} is older than the minimum supported baseline (v${baselineVersion}); upgrade through an intermediate release first. See docs/deployment.md.`
    );
  }
  if (version === latestVersion) return;

  let backupPath: string | null = null;
  if (options.dataDir) backupPath = createMigrationBackup(database, options.dataDir, version);
  runtimeLog(
    "info",
    `Upgrading database schema v${version} -> v${latestVersion}` +
      (backupPath ? ` (pre-migration backup: ${backupPath})` : "") +
      "."
  );
  for (const migration of migrations.filter((item) => item.version > version)) {
    try {
      applyMigration(database, migration, options);
    } catch (error) {
      throw new Error(
        `Migration to v${migration.version} (${migration.description}) failed: ${
          error instanceof Error ? error.message : String(error)
        }.` +
          (backupPath
            ? ` A pre-migration backup is available at ${backupPath}; see docs/deployment.md for restore steps.`
            : "")
      );
    }
    runtimeLog(
      "info",
      `Database schema upgraded to v${migration.version}: ${migration.description}.`
    );
  }
}
