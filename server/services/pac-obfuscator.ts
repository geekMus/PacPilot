import JavaScriptObfuscator, { type ObfuscatorOptions } from "javascript-obfuscator";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";

/**
 * PAC 混淆选项。
 *
 * 只启用标识符重命名与字符串数组：控制流平坦化和死代码注入会让体积显著膨胀、
 * 生成耗时成倍增加，对 PAC 这种小脚本收益有限。
 *
 * `renameGlobals: false` 是硬约束：状态页解析器按 `proxyHosts`、`USER_BLOCK`
 * 等顶层变量名读取规则，一旦重命名，状态页就拿不到任何规则数据。
 *
 * `seed` 必须是固定值。混淆器默认每次运行都从随机种子开始，同样的输入会生成
 * 不同的标识符名与字符串数组顺序；那样每次重建 PAC 的 ETag 和体积都会变，
 * 客户端缓存、条件请求和「内容未变」的判断全部失效（实测未固定 seed 时
 * 6 次相同重建得到 6 个不同 ETag）。固定 seed 后同输入同输出，且不影响混淆强度。
 */
const OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
  // 混淆器默认会在 TTY 下、非 CI 环境里往控制台打印「JavaScript Obfuscator Pro」
  // 广告，并且最多打印 5 次、每 3 天重置，本地开发时每条生成日志都会夹带它。
  // 这里显式关闭，保持服务端日志只输出我们自己的运行信息。
  advertisement: false,
  compact: true,
  target: "browser",
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  sourceMap: false,
  unicodeEscapeSequence: false,
  seed: 20261027,
};

/**
 * 混淆一段 PAC 脚本，输入应当是 terser 压缩后的产物。
 *
 * 顺序必须先是 terser 再是混淆：反过来的话 terser 会把混淆器生成的字符串数组
 * 直接求值内联，混淆强度会被削弱。
 */
export function obfuscatePac(content: string, locale: AppLocale = "zh_CN"): string {
  const result = JavaScriptObfuscator.obfuscate(content, OBFUSCATOR_OPTIONS);
  const code = result.getObfuscatedCode();
  if (typeof code !== "string" || !code.trim()) {
    throw new Error(t(locale, "pacProxy.obfuscateFailed"));
  }
  return code;
}
