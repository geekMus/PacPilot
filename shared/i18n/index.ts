import en_US from "./en_US";
import zh_CN from "./zh_CN";

export type AppLocale = "zh_CN" | "en_US";

interface LocaleTree {
  [key: string]: string | LocaleTree;
}

export const catalogs: Record<AppLocale, LocaleTree> = { en_US, zh_CN };

export function resolveLocale(raw: unknown): AppLocale {
  return String(raw ?? "").trim() === "en_US" ? "en_US" : "zh_CN";
}

function resolveMessage(catalog: LocaleTree, key: string): string | undefined {
  let value: string | LocaleTree = catalog;
  for (const segment of key.split(".")) {
    if (typeof value === "string" || !(segment in value)) return undefined;
    value = value[segment];
  }
  return typeof value === "string" ? value : undefined;
}

export function t(
  locale: AppLocale | string | undefined,
  key: string,
  params?: Record<string, string | number>
): string {
  let text =
    resolveMessage(catalogs[resolveLocale(locale)], key) ?? resolveMessage(catalogs.en_US, key);
  if (!text) throw new Error(`Missing translation key: ${key}`);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
