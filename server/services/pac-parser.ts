/**
 * 解析实际生成的 PAC，通过变量初始化表达式识别当前生成器的 custom 与 remote
 * 模板并提取规则摘要。
 *
 * 解析契约由生成端固定：字符串一律双引号（未压缩输出为 JSON.stringify，
 * 压缩输出由 Terser format.quote_style=2 保证），解析器不再兼容其他引号风格。
 */
export type PacMode = "custom" | "remote" | "custom_parse_error" | "other" | "empty";

export interface PacStatusPayload {
  mode: PacMode;
  blockList: string[];
  directList: string[];
  pacProxy: string | null;
  remoteProxyList: string[];
  remoteDirectList: string[];
  remoteProxyCount: number;
  remoteDirectCount: number;
  updatedAt: string;
  timeZone: string;
  hasPac: boolean;
}

/**
 * 从压缩或未压缩的生成器代码中读取变量初始化表达式。
 * 不依赖分号、换行或声明顺序；支持 Terser 将多个 var 声明合并的输出。
 */
function readInitializer(source: string, name: string): string | null {
  const re = new RegExp("(?:\\bvar\\s+|,\\s*)" + name + "\\s*=");
  const match = re.exec(source);
  if (!match) return null;
  let index = match.index + match[0].length;
  while (/\s/.test(source[index] ?? "")) index++;
  const start = index;
  const first = source[index];

  if (first === "[" || first === "{") {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (; index < source.length; index++) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "[" || char === "{") stack.push(char);
      else if (char === "]" || char === "}") {
        const expected = char === "]" ? "[" : "{";
        if (stack.pop() !== expected) return null;
        if (stack.length === 0) return source.slice(start, index + 1).trim();
      }
    }
    return null;
  }

  if (first === '"') {
    let escaped = false;
    for (index++; index < source.length; index++) {
      const char = source[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') return source.slice(start, index + 1);
    }
    return null;
  }

  index = start;
  while (index < source.length && source[index] !== ";" && source[index] !== ",") index++;
  const value = source.slice(start, index).trim();
  return value || null;
}

function parseJsArray(source: string, name: string): string[] | null {
  const raw = readInitializer(source, name);
  if (raw === null || !raw.startsWith("[") || !raw.endsWith("]")) return null;
  const body = raw.slice(1, -1).trim();
  if (!body) return [];
  // 生成契约：字符串一律双引号，域名不含引号或转义。
  const literals = [...body.matchAll(/"([^"\\]*)"/g)];
  const remainder = body.replace(/"([^"\\]*)"/g, "").replace(/[\s,]/g, "");
  if (remainder) return null;
  return literals.map((item) => item[1]);
}

function parseJsString(source: string, name: string): string | null {
  const raw = readInitializer(source, name);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsMap(source: string, name: string): string[] | null {
  const raw = readInitializer(source, name);
  if (raw === null || !raw.startsWith("{") || !raw.endsWith("}")) return null;
  const body = raw.slice(1, -1).trim();
  if (!body) return [];
  const entries = [...body.matchAll(/"([^"\\]+)"\s*:\s*1\b/g)];
  const remainder = body.replace(/"([^"\\]+)"\s*:\s*1\b/g, "").replace(/[\s,]/g, "");
  if (remainder) return null;
  return [...new Set(entries.map((entry) => entry[1]))];
}

function basePayload(
  mode: PacMode,
  updatedAt: string,
  timeZone: string,
  hasPac: boolean
): PacStatusPayload {
  return {
    mode,
    blockList: [],
    directList: [],
    pacProxy: null,
    remoteProxyList: [],
    remoteDirectList: [],
    remoteProxyCount: 0,
    remoteDirectCount: 0,
    updatedAt,
    timeZone,
    hasPac,
  };
}

export function parsePacStatus(
  pac: string,
  tz = "Asia/Shanghai",
  generatedAt: Date | null = null
): PacStatusPayload {
  const updatedAt = generatedAt?.toISOString() ?? "";
  const hasPac = Boolean(pac.trim());

  if (!hasPac) {
    return basePayload("empty", updatedAt, tz, false);
  }

  const remoteTemplate =
    /\bvar\s+proxyHosts\s*=\s*\{/.test(pac) || /\bvar\s+USER_BLOCK\s*=\s*\[/.test(pac);

  if (remoteTemplate) {
    const blockList = parseJsArray(pac, "USER_BLOCK");
    const directList = parseJsArray(pac, "USER_DIRECT");
    const remoteProxy = parseJsMap(pac, "proxyHosts");
    const remoteDirect = parseJsMap(pac, "remoteDirect");
    const pacProxy = parseJsString(pac, "PROXY");
    if (
      blockList === null ||
      directList === null ||
      remoteProxy === null ||
      remoteDirect === null ||
      pacProxy === null
    ) {
      return basePayload("custom_parse_error", updatedAt, tz, hasPac);
    }
    return {
      ...basePayload("remote", updatedAt, tz, hasPac),
      blockList,
      directList,
      pacProxy,
      remoteProxyList: remoteProxy,
      remoteDirectList: remoteDirect,
      remoteProxyCount: remoteProxy.length,
      remoteDirectCount: remoteDirect.length,
    };
  }

  const customTemplate =
    /\bvar\s+BLOCK_LIST\s*=\s*\[/.test(pac) ||
    /\bvar\s+DIRECT_LIST\s*=\s*\[/.test(pac) ||
    /\bvar\s+PAC_PROXY\s*=/.test(pac);
  if (customTemplate) {
    const blockList = parseJsArray(pac, "BLOCK_LIST");
    const directList = parseJsArray(pac, "DIRECT_LIST");
    const pacProxy = parseJsString(pac, "PAC_PROXY");
    if (blockList === null || directList === null || pacProxy === null) {
      return basePayload("custom_parse_error", updatedAt, tz, hasPac);
    }
    return {
      ...basePayload("custom", updatedAt, tz, hasPac),
      blockList,
      directList,
      pacProxy,
    };
  }

  return basePayload("other", updatedAt, tz, hasPac);
}
