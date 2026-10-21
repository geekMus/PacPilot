import { createI18n } from "vue-i18n";
import { catalogs, resolveLocale, type AppLocale } from "../../../shared/i18n";

export { resolveLocale, type AppLocale };

const STORAGE_KEY = "PacPilot-locale";

export function readStoredLocale(): AppLocale {
  try {
    return resolveLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "zh_CN";
  }
}

export function persistLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    // HTML lang 使用 BCP 47 连字符形式
    document.documentElement.lang = locale === "en_US" ? "en-US" : "zh-CN";
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: "zh_CN",
  messages: catalogs,
});

export function setAppLocale(locale: AppLocale): void {
  const next = resolveLocale(locale);
  i18n.global.locale.value = next;
  persistLocale(next);
}
