import type { AppSettings } from "../../domain/settings";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import type { AppDatabase } from "./database";
import { setSettings } from "./settings";

export function vacuumDatabase(database: AppDatabase, truncateWal = false): void {
  if (truncateWal) database.run("PRAGMA wal_checkpoint(TRUNCATE);");
  database.run("VACUUM;");
}
export function checkpointDatabase(database: AppDatabase): void {
  database.run("PRAGMA wal_checkpoint(TRUNCATE);");
}
export function resetOperationalData(database: AppDatabase, settings = DEFAULT_SETTINGS): {
  accessEvents: number;
  workflows: number;
} {
  database.run("BEGIN IMMEDIATE");
  try {
    const accessEvents = Number(database.query("DELETE FROM access_events").run().changes);
    const workflows = Number(database.query("DELETE FROM workflow_runs").run().changes);
    database.query("DELETE FROM settings WHERE key = ?").run("notifications");
    setSettings(database, settings);
    database.run("COMMIT");
    return { accessEvents, workflows };
  } catch (error) {
    try { database.run("ROLLBACK"); } catch { /* transaction already closed */ }
    throw error;
  }
}
