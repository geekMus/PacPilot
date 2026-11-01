/**
 * PAC 构建子进程入口。
 *
 * 压缩（terser）与混淆（javascript-obfuscator）都是 CPU 密集的同步任务。放在主进程
 * 里执行时，生成期间整个事件循环被占满：`/pac` 请求无法响应，管理端的状态查询也会
 * 一直等到生成结束；主进程还得常驻这两个包的几十兆内存。
 *
 * 把它们搬到独立子进程后：
 *
 * 1. 主线程在生成期间继续正常处理 HTTP 请求；
 * 2. 子进程退出时，它的全部内存随进程一起归还操作系统，主进程不会因为
 *    terser / 混淆器常驻而多占内存。
 *
 * 协议：stdin 收一整段 JSON 请求，stdout 回一整段 JSON 响应。
 *
 * 这是进程入口，没有可单测的导出，因此不计入单元测试覆盖率统计；它的行为由
 * `server/tests/pac-build-worker.test.ts` 通过客户端端到端覆盖。
 */
import { minify } from "terser";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";

interface PacBuildRequest {
  /** 待构建的 PAC 源码（未压缩、未混淆）。 */
  code: string;
  /** 是否先用 terser 压缩。 */
  compress: boolean;
  /** 是否在压缩之后做混淆。 */
  obfuscate: boolean;
  locale: AppLocale;
}

interface PacBuildResponse {
  ok: boolean;
  code?: string;
  error?: string;
}

/** 与主进程 `compressPac` 保持完全一致的压缩参数。 */
async function compressPac(content: string, locale: AppLocale): Promise<string> {
  const result = await minify(content, {
    ecma: 5,
    compress: { defaults: true, passes: 2 },
    // 不混淆变量名，避免无意义的可读性损失。
    mangle: false,
    // 固定双引号输出：pac-parser 按此契约解析，不再兼容其他引号风格。
    format: { comments: false, beautify: false, ecma: 5, quote_style: 2 },
  });
  if (typeof result.code !== "string" || !result.code.trim()) {
    throw new Error(t(locale, "pacProxy.compressFailed"));
  }
  return result.code;
}

/**
 * 压缩 → 混淆 → 返回最终代码。
 *
 * 顺序必须先是 terser 再是混淆：反过来的话 terser 会把混淆器生成的字符串数组求值
 * 内联，混淆强度会被削弱（实测字符串数组条目从 9 处降到 0 处）。
 */
async function buildPacBody(request: PacBuildRequest): Promise<string> {
  let code = request.code;
  if (request.compress || request.obfuscate) {
    code = await compressPac(code, request.locale);
  }
  if (request.obfuscate) {
    // 混淆器体积大（加载即占十几兆常驻内存），因此只在混淆真正开启时动态加载。
    const { obfuscatePac } = await import("../services/pac-obfuscator");
    code = obfuscatePac(code, request.locale);
  }
  return code;
}

async function readRequest(): Promise<PacBuildRequest> {
  const raw = await Bun.stdin.text();
  const parsed = JSON.parse(raw) as PacBuildRequest;
  if (typeof parsed?.code !== "string") {
    throw new Error("PAC 构建请求缺少代码内容。");
  }
  return {
    code: parsed.code,
    compress: Boolean(parsed.compress),
    obfuscate: Boolean(parsed.obfuscate),
    locale: parsed.locale === "en_US" ? "en_US" : "zh_CN",
  };
}

async function main(): Promise<void> {
  let response: PacBuildResponse;
  try {
    const request = await readRequest();
    response = { ok: true, code: await buildPacBody(request) };
  } catch (error) {
    response = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  await Bun.write(Bun.stdout, JSON.stringify(response));
  process.exit(0);
}

await main();
