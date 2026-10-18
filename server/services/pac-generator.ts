import fs from "fs";
import path from "path";
import type { AppDatabase } from "../db/sqlite";
import type { AppSettings } from "../db/settings";
import { appendGenerationLog, getSettings } from "../db/sqlite";
import { notifyFailure, notifySuccess } from "./webhook";
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

function toJsArray(list: string[]): string {
  return list.map((item) => JSON.stringify(item)).join(",");
}

function buildCustomPac(settings: AppSettings): string {
  const blockJs = toJsArray(settings.blockList);
  const directJs = toJsArray(settings.directList);
  const proxy = settings.pacProxy.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `// User defined PAC (custom mode)
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
  const pac = buildRemoteListPac(
    settings.pacProxy,
    parsed.proxyHosts,
    parsed.directHosts,
    settings.blockList,
    settings.directList,
    settings.pacCompress
  );
  fs.writeFileSync(outFile, pac, "utf8");
  return `SUCCESS (remote list, format=${parsed.format}, proxy=${parsed.proxyHosts.length}, direct=${parsed.directHosts.length})`;
}

export async function generatePac(
  database: AppDatabase,
  dataDir: string
): Promise<GenerateResult> {
  const settings = getSettings(database);
  const pacPath = path.join(dataDir, "proxy.pac");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    let message: string;
    if (settings.mode === "remote") {
      message = await runRemoteMode(settings, pacPath);
    } else {
      fs.writeFileSync(pacPath, buildCustomPac(settings), "utf8");
      message = "SUCCESS (custom rules mode)";
    }

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
