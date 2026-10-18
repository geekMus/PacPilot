/**
 * 从 PAC 源码解析自定义规则（供 /api/status 使用）
 */

export interface PacStatusPayload {
  mode: "custom" | "custom_parse_error" | "genpac_or_other";
  modeLabel: string;
  blockList: string[];
  directList: string[];
  pacProxy: string | null;
  notice: string;
  updatedAt: string;
  hasPac: boolean;
}

function parseJsArray(source: string, name: string): string[] | null {
  const re = new RegExp(`\\bvar\\s+${name}\\s*=\\s*\\[(.*?)\\]\\s*;`, "s");
  const match = source.match(re);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return [];
  const literals = raw.match(/"(?:\\.|[^"\\])*"/g) || [];
  try {
    return literals.map((item) => JSON.parse(item) as string);
  } catch {
    return null;
  }
}

function parseJsString(source: string, name: string): string | null {
  const re = new RegExp(
    `\\bvar\\s+${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`
  );
  const match = source.match(re);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

export function parsePacStatus(
  pac: string,
  tz = "Asia/Shanghai"
): PacStatusPayload {
  const updatedAt = new Date().toLocaleString("zh-CN", { timeZone: tz });
  const hasPac = Boolean(pac.trim());
  const isCustom = pac.includes("User defined PAC (no genpac)");

  if (isCustom) {
    const blockList = parseJsArray(pac, "BLOCK_LIST");
    const directList = parseJsArray(pac, "DIRECT_LIST");
    const pacProxy = parseJsString(pac, "PAC_PROXY");

    if (blockList === null || directList === null || pacProxy === null) {
      return {
        mode: "custom_parse_error",
        modeLabel: "自定义规则模式（解析异常）",
        blockList: [],
        directList: [],
        pacProxy: null,
        notice:
          "当前 proxy.pac 带有自定义规则标记，但无法完整读取规则变量。",
        updatedAt,
        hasPac,
      };
    }

    return {
      mode: "custom",
      modeLabel: "自定义规则模式",
      blockList,
      directList,
      pacProxy,
      notice: `未命中内网/本地、黑名单或直连列表的主机将返回：${pacProxy}`,
      updatedAt,
      hasPac,
    };
  }

  return {
    mode: "genpac_or_other",
    modeLabel: "非自定义模板（可能为 genpac 模式）",
    blockList: [],
    directList: [],
    pacProxy: null,
    notice:
      "当前 proxy.pac 不是自定义规则模板。若为 genpac 模式，规则由 GFWList 生成；自定义直连/黑名单不会注入。",
    updatedAt,
    hasPac,
  };
}
