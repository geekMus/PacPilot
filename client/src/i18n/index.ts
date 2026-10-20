import { createI18n } from "vue-i18n";
import zh_CN from "./locales/zh_CN";
import en_US from "./locales/en_US";

/** 界面与生成物语言，采用常见区域码（下划线形式）。 */
export type AppLocale = "zh_CN" | "en_US";

const STORAGE_KEY = "genpac-runner-locale";

export function resolveLocale(raw: unknown): AppLocale {
  const value = String(raw || "").trim().toLowerCase().replace(/-/g, "_");
  // 兼容旧版 zh / en
  if (value === "en" || value === "en_us" || value === "english") return "en_US";
  return "zh_CN";
}

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
  messages: { zh_CN, en_US },
});

export function setAppLocale(locale: AppLocale): void {
  const next = resolveLocale(locale);
  i18n.global.locale.value = next;
  persistLocale(next);
}
