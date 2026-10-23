import type { AppSettings } from "../../../shared/contracts";
import type { SettingsRepository } from "../repositories";
import type { Database } from "bun:sqlite";
import { getSettings, setSettings, updateSettings } from "./settings";

export function createSqliteSettingsRepository(database: Database): SettingsRepository {
  return {
    get: () => getSettings(database),
    set: (settings: AppSettings) => setSettings(database, settings),
    update: (patch: Partial<AppSettings>) => updateSettings(database, patch),
  };
}
