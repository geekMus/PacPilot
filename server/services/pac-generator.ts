import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import type { AppDatabase } from "../db/sqlite";
import type { AppSettings } from "../db/settings";
import { appendGenerationLog, getSettings } from "../db/sqlite";
import { notifyFailure, notifySuccess } from "./webhook";

const execFileAsync = promisify(execFile);

export interface GenerateResult {
  success: boolean;
  mode: string;
  message: string;
  pacPath: string;
}

function toJsArray(list: string[]): string {
  return list
    .map((item) => JSON.stringify(item))
    .join(",");
}

function buildCustomPac(settings: AppSettings): string {
  const blockJs = toJsArray(settings.blockList);
  const directJs = toJsArray(settings.directList);
  const proxy = settings.pacProxy.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `// --------------------------------------------------
// User defined PAC (no genpac)
// --------------------------------------------------

function isMatch(host, list) {
    for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        if (rule.indexOf('*') !== -1) {
            if (shExpMatch(host, rule)) return true;
        } else {
            if (host === rule || shExpMatch(host, "*." + rule)) return true;
        }
    }
    return false;
}

var BLOCK_LIST  = [${blockJs}];
var DIRECT_LIST = [${directJs}];
var PAC_PROXY   = "${proxy}";

function FindProxyForURL(url, host) {

    // 0️⃣ 本地 / 内网地址：永远直连
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

    // 1️⃣ 黑名单：直接丢弃
    if (BLOCK_LIST.length && isMatch(host, BLOCK_LIST)) {
        return "PROXY 0.0.0.0:0";
    }

    // 2️⃣ 强制直连
    if (DIRECT_LIST.length && isMatch(host, DIRECT_LIST)) {
        return "DIRECT";
    }

    // 3️⃣ 默认：走代理
    return PAC_PROXY;
}
`;
}

async function runGenpac(settings: AppSettings, outFile: string): Promise<void> {
  if (!settings.gfwlistUrl) {
    throw new Error("genpac 模式需要配置 GFWList URL");
  }

  const args = [
    "--format=pac",
    `--pac-proxy=${settings.pacProxy}`,
    `--gfwlist-url=${settings.gfwlistUrl}`,
    `--output=${outFile}`,
  ];

  if (settings.pacCompress) {
    args.push("--pac-compress");
  }
  if (settings.pacPrecise) {
    args.push("--pac-precise");
  }

  // 优先使用 PATH 中的 genpac；Docker 镜像会安装它
  try {
    await execFileAsync("genpac", args, {
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string; code?: string };
    if (e.code === "ENOENT") {
      throw new Error(
        "未找到 genpac 命令。请使用包含 genpac 的 Docker 镜像，或在本机安装 genpac。"
      );
    }
    throw new Error(e.stderr || e.message || "genpac 执行失败");
  }
}

/**
 * 根据当前 SQLite 配置生成 PAC 文件。
 */
export async function generatePac(
  database: AppDatabase,
  dataDir: string
): Promise<GenerateResult> {
  const settings = getSettings(database);
  const pacPath = path.join(dataDir, "proxy.pac");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    if (settings.mode === "genpac") {
      await runGenpac(settings, pacPath);
    } else {
      const content = buildCustomPac(settings);
      fs.writeFileSync(pacPath, content, "utf8");
    }

    const message =
      settings.mode === "genpac"
        ? "SUCCESS (genpac mode)"
        : "SUCCESS (custom rules mode)";

    appendGenerationLog(database, true, settings.mode, message);
    await notifySuccess(settings);

    console.log(`[pac] ${message} -> ${pacPath}`);
    return { success: true, mode: settings.mode, message, pacPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    appendGenerationLog(database, false, settings.mode, message);
    await notifyFailure(settings);
    console.error(`[pac] FAILED: ${message}`);
    return { success: false, mode: settings.mode, message, pacPath };
  }
}

export function readPacFile(dataDir: string): string {
  const pacPath = path.join(dataDir, "proxy.pac");
  try {
    return fs.readFileSync(pacPath, "utf8");
  } catch {
    return "";
  }
}

export function pacFileMtime(dataDir: string): Date | null {
  const pacPath = path.join(dataDir, "proxy.pac");
  try {
    return fs.statSync(pacPath).mtime;
  } catch {
    return null;
  }
}
