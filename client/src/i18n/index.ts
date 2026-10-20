import { createI18n } from "vue-i18n";
import zh from "./locales/zh";
import en from "./locales/en";

export type AppLocale = "zh" | "en";

const STORAGE_KEY = "genpac-runner-locale";

export function readStoredLocale(): AppLocale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)?.toLowerCase();
    if (value === "en") return "en";
  } catch {
    /* ignore */
  }
  return "zh";
}

export function persistLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: "zh",
  messages: { zh, en },
});

export function setAppLocale(locale: AppLocale): void {
  const next = locale === "en" ? "en" : "zh";
  i18n.global.locale.value = next;
  persistLocale(next);
}

export function resolveLocale(raw: unknown): AppLocale {
  const value = String(raw || "").trim().toLowerCase();
  return value === "en" || value === "en-us" ? "en" : "zh";
}
