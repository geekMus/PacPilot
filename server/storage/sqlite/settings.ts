import type { AppSettings } from "../../domain/settings";
import { DEFAULT_SETTINGS, normalizeAppSettings } from "../../domain/settings";
import type { AppDatabase } from "./database";

export function getSettings(database: AppDatabase): AppSettings {
  const row = database.query("SELECT value FROM settings WHERE key = ?").get("config") as {
    value: string;
  } | null;

  if (!row) throw new Error("Application settings are not initialized in the database.");

  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Stored application settings must be a JSON object.");
    }
    return normalizeAppSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch (error) {
    throw new Error(
      `Failed to read application settings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function setSettings(database: AppDatabase, settings: AppSettings): void {
  const normalized = normalizeAppSettings(settings);
  database
    .query(
      `INSERT INTO settings (key, value) VALUES ('config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(JSON.stringify(normalized));
}

export function updateSettings(database: AppDatabase, patch: Partial<AppSettings>): AppSettings {
  const current = getSettings(database);
  const next = normalizeAppSettings({ ...current, ...patch });
  setSettings(database, next);
  return next;
}
