import JavaScriptObfuscator, { type ObfuscatorOptions } from "javascript-obfuscator";

/**
 * PAC 混淆选项。
 *
 * 只启用标识符重命名与字符串数组：控制流平坦化和死代码注入会让体积显著膨胀、
 * 生成耗时成倍增加，对 PAC 这种小脚本收益有限。
 *
 * `renameGlobals: false` 是硬约束：状态页解析器按 `proxyHosts`、`USER_BLOCK`
 * 等顶层变量名读取规则，一旦重命名，状态页就拿不到任何规则数据。
 */
const OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
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
};

/**
 * 混淆一段 PAC 脚本，输入应当是 terser 压缩后的产物。
 *
 * 顺序必须先是 terser 再是混淆：反过来的话 terser 会把混淆器生成的字符串数组
 * 直接求值内联，混淆强度会被削弱。
 */
export function obfuscatePac(content: string): string {
  const result = JavaScriptObfuscator.obfuscate(content, OBFUSCATOR_OPTIONS);
  const code = result.getObfuscatedCode();
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("PAC 混淆失败：混淆器未生成有效代码。");
  }
  return code;
}
