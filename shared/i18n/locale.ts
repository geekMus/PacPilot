export type AppLocale = "zh_CN" | "en_US";

/**
 * 语言标记归一化：只保留中英文两套目录，其余一律回落到中文。
 *
 * 单独成文件而不是放在 `shared/i18n/index.ts`，是为了让浏览器端能只导入这个
 * 纯函数：`index.ts` 会连带导出 `catalogs`（中英两套完整词条，gzip 后约 15KB），
 * 入口 chunk 不应该为了一个语言判断白背整份英文目录。
 */
export function resolveLocale(raw: unknown): AppLocale {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "en_us" || value === "en-us" || value.startsWith("en-") || value === "en"
    ? "en_US"
    : "zh_CN";
}
