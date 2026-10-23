import type { AppSettings } from "../../../shared/contracts";
import { DEFAULT_SETTINGS, normalizeAppSettings } from "../../domain/settings";
import type { SettingsRepository } from "../repositories";
import { clone } from "./utils";

export function createMemorySettingsRepository(): SettingsRepository {
  let settings = normalizeAppSettings(DEFAULT_SETTINGS);
  const settingsRepository = {
    get: () => clone(settings),
    set(value: AppSettings) { settings = normalizeAppSettings(value); },
    update(patch: Partial<AppSettings>) { settings = normalizeAppSettings({ ...settings, ...clone(patch) }); return clone(settings); },
};
  return settingsRepository;
}
