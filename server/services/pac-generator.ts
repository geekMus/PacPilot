import fs from "fs";
import { minify } from "terser";
import path from "path";
import { isIP } from "node:net";
import type { AppDatabase } from "../db/sqlite";
import type { AppSettings } from "../db/settings";
import { appendGenerationLog, getSettings } from "../db/sqlite";
import { notifyFailure, notifySuccess } from "./webhook";
import { APP_VERSION } from "../version";
import {
  buildRemoteListPac,
  fetchAndParseRemoteList,
} from "./remote-list";

export interface GenerateResult {
  success: boolean;
  mode: string;
  message: string;
  pacPath: string;
}

export interface EngineProbe {
  available: boolean;
  engine: string;
  detail: string;
}
/**
 * 校验 PAC 返回值中的代理指令，避免把格式错误的字符串写入最终 PAC。
 * 每个代理项以分号分隔；代理地址必须包含有效端口。
 */
export function validatePacProxyString(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "请填写 PAC 代理字符串。";

  const entries = raw.split(";").map((entry) => entry.trim());
  // 允许最后一个代理项后面带分号，但不允许中间出现空项。
  while (entries.length > 0 && entries[entries.length - 1] === "") entries.pop();
  if (entries.length === 0 || entries.some((entry) => !entry)) {
    return "代理项之间请使用分号分隔，不能包含空代理项。";
  }

  const hostnamePattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i;

  for (const [index, entry] of entries.entries()) {
    if (/^DIRECT$/i.test(entry)) continue;

    const match = entry.match(/^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+(\S+)$/i);
    if (!match) {
      return "第 " + (index + 1) + " 项“" + entry + "”格式无效。请使用 PROXY、HTTP、HTTPS、SOCKS、SOCKS4、SOCKS5 或 DIRECT 指令。";
    }

    const endpoint = match[2];
    const endpointMatch = endpoint.match(/^(?:\[([^\]]+)\]|([^:\[\]\s]+)):(\d{1,5})$/);
    if (!endpointMatch) {
      return "第 " + (index + 1) + " 项代理地址格式无效，请使用 host:port；IPv6 地址请写成 [IPv6]:port。";
    }

    const host = endpointMatch[1] ?? endpointMatch[2] ?? "";
    const port = Number(endpointMatch[3]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return "第 " + (index + 1) + " 项端口无效，端口范围必须是 1–65535。";
    }

    if (endpointMatch[1]) {
      if (isIP(host) !== 6) {
        return "第 " + (index + 1) + " 项的 IPv6 地址无效。";
      }
    } else {
      const looksLikeIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
      const validHost = host.length <= 253 &&
        (looksLikeIpv4 ? isIP(host) === 4 : hostnamePattern.test(host));
      if (!validHost) {
        return "第 " + (index + 1) + " 项的代理主机名或 IP 地址无效。";
      }
    }
  }

  return null;
}


async function compressPac(content: string): Promise<string> {
  const result = await minify(content, {
    ecma: 5,
    compress: { defaults: true, passes: 2 },
    // 不混淆变量名，避免无意义的可读性损失。
    mangle: false,
    format: { comments: false, beautify: false, ecma: 5 },
  });
  if (typeof result.code !== "string" || !result.code.trim()) {
    throw new Error("PAC 压缩失败：压缩器未生成有效代码。");
  }
  return result.code;
}

function formatPacGeneratedAt(date: Date): string {
  // ISO UTC plus a readable local stamp for operators browsing the file.
  const iso = date.toISOString();
  const local = date.toLocaleString("zh-CN", { hour12: false });
  return iso + "（本地 " + local + "）";
}

function stripPacMetaHeaders(content: string): string {
  return content
    .replace(/^\/\/ genpac-runner (?:version:|版本[:：]).*(?:\r?\n|$)/gim, "")
    .replace(/^\/\/ genpac-runner 生成时间[:：].*(?:\r?\n|$)/gim, "")
    .replace(/^\n+/, "");
}

/**
 * Write or refresh PAC file metadata headers.
 * Pass `generatedAt` when this write is a real generation so operators can see when the rules were produced.
 * On read-only refresh, omit `generatedAt` to preserve an existing timestamp line.
 */
function withPacVersionHeader(content: string, generatedAt?: Date | null): string {
  const existingGenerated = content.match(/^\/\/ genpac-runner 生成时间[:：]\s*(.+)\s*$/im)?.[1]?.trim() || "";
  const body = stripPacMetaHeaders(content);
  const lines = ["// genpac-runner 版本：" + APP_VERSION];
  const stamp = generatedAt
    ? formatPacGeneratedAt(generatedAt)
    : existingGenerated;
  if (stamp) {
    lines.push("// genpac-runner 生成时间：" + stamp);
  }
  return lines.join("\n") + "\n" + body;
}

function toJsArray(list: string[], compress: boolean): string {
  return list.map((item) => JSON.stringify(item)).join(compress ? "," : ",\n    ");
}

function buildCustomPac(settings: AppSettings): string {
  const blockJs = toJsArray(settings.blockList, false);
  const directJs = toJsArray(settings.directList, false);

  return `// genpac-runner 生成的 PAC（自定义规则模式）
// 本机和内网地址优先直连；黑名单优先于自定义直连，其余请求使用默认代理
function isMatch(host, list) {
    host = String(host).toLowerCase().replace(/\.$/, "");
    for (var i = 0; i < list.length; i++) {
        var rule = String(list[i]).toLowerCase().replace(/\.$/, "");
        if (rule.indexOf("**.") === 0) {
            var root = rule.substring(3);
            if (host === root || host.slice(-(root.length + 1)) === "." + root) return true;
        } else if (rule.indexOf("*.") === 0) {
            var suffix = rule.substring(2);
            if (host.length > suffix.length + 1 && host.slice(-(suffix.length + 1)) === "." + suffix) return true;
        } else if (host === rule) {
            return true;
        }
    }
    return false;
}

// 自定义黑名单与直连规则
var BLOCK_LIST  = [\n    ${blockJs}\n];
var DIRECT_LIST = [\n    ${directJs}\n];
// 默认代理策略（多个代理选项使用分号分隔）
var PAC_PROXY   = ${JSON.stringify(settings.pacProxy)};

function FindProxyForURL(url, host) {
    if (
        host === "localhost" ||
        host.indexOf('.') === -1 ||
        isInNet(host, "127.0.0.0", "255.0.0.0") ||
        isInNet(host, "10.0.0.0", "255.0.0.0") ||
        isInNet(host, "172.16.0.0", "255.240.0.0") ||
        isInNet(host, "192.168.0.0", "255.255.0.0")
    ) {
        return "DIRECT";
    }
    if (BLOCK_LIST.length && isMatch(host, BLOCK_LIST)) {
        return "PROXY 0.0.0.0:0";
    }
    if (DIRECT_LIST.length && isMatch(host, DIRECT_LIST)) {
        return "DIRECT";
    }
    return PAC_PROXY;
}
`;
}

/** 远程列表引擎为内置实现，始终可用 */
export async function probeGenpac(): Promise<EngineProbe> {
  return {
    available: true,
    engine: "builtin-remote-list",
    detail:
      "使用 Bun 内置引擎：从你配置的远程 URL 拉取规则列表并生成 PAC（支持 GFWList / 明文域名 / ABP 规则），无需 Python 或 genpac。",
  };
}

async function runRemoteMode(
  settings: AppSettings,
  outFile: string
): Promise<string> {
  if (!settings.listUrl) {
    throw new Error("远程列表模式需要配置列表 URL（listUrl）");
  }
  const parsed = await fetchAndParseRemoteList(settings.listUrl);
  // 内部源文件始终保留未压缩版本，状态页只解析该文件。
  const pac = buildRemoteListPac(
    settings.pacProxy,
    parsed.proxyHosts,
    parsed.directHosts,
    settings.blockList,
    settings.directList,
    false
  );
  const generatedAt = new Date();
  const source = withPacVersionHeader(pac, generatedAt);
  const output = settings.pacCompress ? withPacVersionHeader(await compressPac(pac), generatedAt) : source;
  fs.writeFileSync(path.join(path.dirname(outFile), "proxy.source.pac"), source, "utf8");
  fs.writeFileSync(outFile, output, "utf8");
  const formatLabel = parsed.format === "gfwlist-base64"
    ? "GFWList（Base64）"
    : parsed.format === "abp"
      ? "AutoProxy / ABP"
      : "明文域名列表";
  return `生成成功（远程规则：${formatLabel}，代理域名 ${parsed.proxyHosts.length} 条，例外直连 ${parsed.directHosts.length} 条）`;
}

export async function generatePac(
  database: AppDatabase,
  dataDir: string
): Promise<GenerateResult> {
  const settings = getSettings(database);
  const pacPath = path.join(dataDir, "proxy.pac");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const proxyError = validatePacProxyString(settings.pacProxy);
    if (proxyError) throw new Error(proxyError);

    let message: string;
    if (settings.mode === "remote") {
      message = await runRemoteMode(settings, pacPath);
    } else {
      const customPac = buildCustomPac(settings);
      const generatedAt = new Date();
      const source = withPacVersionHeader(customPac, generatedAt);
      const output = settings.pacCompress
        ? withPacVersionHeader(await compressPac(customPac), generatedAt)
        : source;
      fs.writeFileSync(path.join(dataDir, "proxy.source.pac"), source, "utf8");
      fs.writeFileSync(pacPath, output, "utf8");
      message = "生成成功（自定义规则模式" + (settings.pacCompress ? "，已压缩" : "，未压缩") + "）";
    }

    appendGenerationLog(database, true, settings.mode, message);
    await notifySuccess(settings);
    console.log(`[PAC] ${message}，文件：${pacPath}`);
    return { success: true, mode: settings.mode, message, pacPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    appendGenerationLog(database, false, settings.mode, message);
    await notifyFailure(settings, message);
    console.error(`[PAC] 生成失败：${message}`);
    return { success: false, mode: settings.mode, message, pacPath };
  }
}

export function readPacFile(dataDir: string): string {
  const pacPath = path.join(dataDir, "proxy.pac");
  try {
    const original = fs.readFileSync(pacPath, "utf8");
    const versioned = withPacVersionHeader(original);
    // 为升级前已生成的 PAC 补上当前版本头；规则正文不变。
    if (versioned !== original) {
      try {
        fs.writeFileSync(pacPath, versioned, "utf8");
      } catch {
        // 即使数据目录只读，也返回带版本头的内容供浏览器查看。
      }
    }
    return versioned;
  } catch {
    return "";
  }
}

/**
 * 读取始终未压缩的内部 PAC 源文件供状态页解析。
 * 兼容升级前的数据目录：源文件尚不存在时回退到现有 proxy.pac。
 */
export function readPacSourceFile(dataDir: string): string {
  const pacPath = path.join(dataDir, "proxy.pac");
  // proxy.source.pac is only an auxiliary parser input; never report a PAC as
  // available when the client-facing file is absent or empty.
  let clientPac: string;
  try {
    clientPac = fs.readFileSync(pacPath, "utf8");
  } catch {
    return "";
  }
  if (!clientPac.trim()) return "";

  const sourcePath = path.join(dataDir, "proxy.source.pac");
  try {
    const sourcePac = fs.readFileSync(sourcePath, "utf8");
    return sourcePac.trim() ? sourcePac : clientPac;
  } catch {
    return clientPac;
  }
}

export function pacFileMtime(dataDir: string): Date | null {
  const sourcePath = path.join(dataDir, "proxy.source.pac");
  const pacPath = path.join(dataDir, "proxy.pac");
  try {
    const pacStat = fs.statSync(pacPath);
    if (!pacStat.isFile() || pacStat.size === 0) return null;
    const sourceStat = fs.statSync(sourcePath);
    return sourceStat.isFile() && sourceStat.size > 0 ? sourceStat.mtime : pacStat.mtime;
  } catch {
    try {
      const pacStat = fs.statSync(pacPath);
      return pacStat.isFile() && pacStat.size > 0 ? pacStat.mtime : null;
    } catch {
      return null;
    }
  }
}
