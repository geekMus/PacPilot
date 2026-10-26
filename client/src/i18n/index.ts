import { createI18n } from "vue-i18n";
import zh_CN from "@shared/i18n/zh_CN";
import { resolveLocale, type AppLocale } from "@shared/i18n/locale";

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

// 只静态打包中文；类型上仍声明两套语言，这样 `locale.value` 的联合类型不会被
// 收窄成只剩 "zh_CN"，`setAppLocale()` 切换语言才通得过类型检查。
const messages: Partial<Record<AppLocale, typeof zh_CN>> = { zh_CN };

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: "zh_CN",
  // 中文是默认与回退语言，静态打进入口；英文目录改为按需下载：它 gzip 后约 15KB，
  // 对绝大多数中文用户完全是净负担，占入口 chunk 的体积却接近六分之一。
  messages,
});

const loadedLocales = new Set<AppLocale>(["zh_CN"]);

/** 英文词条只在真正需要时下载：英文用户首屏，或用户主动切换语言。 */
export async function ensureLocaleMessages(locale: AppLocale): Promise<void> {
  const next = resolveLocale(locale);
  if (loadedLocales.has(next)) return;
  const messages = (await import("@shared/i18n/en_US")).default;
  i18n.global.setLocaleMessage(next, messages);
  loadedLocales.add(next);
}

export async function setAppLocale(locale: AppLocale): Promise<void> {
  const next = resolveLocale(locale);
  // 先取回词条再切语言，避免切换瞬间整页退化成回退语言。
  await ensureLocaleMessages(next);
  i18n.global.locale.value = next;
  persistLocale(next);
}
