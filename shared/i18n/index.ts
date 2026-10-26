import en_US from "./en_US";
import zh_CN from "./zh_CN";
import { resolveLocale, type AppLocale } from "./locale";

// 语言类型与归一化逻辑单独放在 `./locale`，浏览器端只导入那个文件就不会把两份
// 完整词条拖进入口 chunk；这里继续导出同一个 API，服务端与脚本调用方无需改动。
export { resolveLocale };
export type { AppLocale };

interface LocaleTree {
  [key: string]: string | LocaleTree;
}

export const catalogs: Record<AppLocale, LocaleTree> = { en_US, zh_CN };

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
