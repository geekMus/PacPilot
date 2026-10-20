/**
 * 远程规则列表 → PAC（纯 TypeScript / Bun）。
 * 用户自定义直连 / 黑名单始终优先于远程列表规则。
 */

import { assertSafeHttpUrl } from "../utils/url-safety";

export interface RemoteListFetchMeta {
  url: string;
  method: string;
  status: number;
  status_text: string;
  duration_ms: number;
  response_bytes: number;
  content_type: string;
  attempts: number;
  request_headers: Record<string, string>;
  response_headers: Record<string, string>;
}

export interface RemoteListParseResult {
  proxyHosts: string[];
  directHosts: string[];
  format: "gfwlist-base64" | "abp" | "plain-domains";
  rawLineCount: number;
  fetch?: RemoteListFetchMeta;
}

function isLikelyDomain(s: string): boolean {
  if (!s || s.length < 2 || s.length > 253) return false;
  if (s.includes("://") || s.includes("/") || s.includes(" ")) return false;
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
      s
    ) || /^[a-z0-9._-]+$/i.test(s)
  );
}

function stripHostFromRule(line: string): string | null {
  let s = line.trim();
  if (!s || s.startsWith("!") || s.startsWith("[")) return null;
  if (s.startsWith("||")) s = s.slice(2);
  else if (s.startsWith("|")) s = s.slice(1);
  s = s.replace(/^https?:\/\//i, "");
  s = (s.split("/")[0] ?? s).split("?")[0] ?? s;
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^\*\./, "").replace(/^\./, "").replace(/\^.*$/, "").trim().toLowerCase();
  if (!s || s.includes("*") || s.includes("^")) return null;
  if (!isLikelyDomain(s) && !/^[a-z0-9._-]+$/i.test(s)) return null;
  return s;
}

function parseAbpOrAutoproxy(decoded: string): RemoteListParseResult {
  const proxy = new Set<string>();
  const direct = new Set<string>();
  let rawLineCount = 0;

  for (const raw of decoded.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    rawLineCount++;
    const isException = line.startsWith("@@");
    const body = isException ? line.slice(2) : line;
    const host = stripHostFromRule(body);
    if (!host) continue;
    if (isException) {
      direct.add(host);
      proxy.delete(host);
    } else if (!direct.has(host)) {
      proxy.add(host);
    }
  }

  return {
    proxyHosts: [...proxy].sort(),
    directHosts: [...direct].sort(),
    format: "abp",
    rawLineCount,
  };
}

function parsePlainDomains(text: string): RemoteListParseResult {
  const proxy = new Set<string>();
  let rawLineCount = 0;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (
      !line ||
      line.startsWith("#") ||
      line.startsWith("//") ||
      line.startsWith("!")
    )
      continue;
    rawLineCount++;
    line = line.replace(/^\*\./, "").replace(/^\./, "").toLowerCase();
    if (isLikelyDomain(line)) proxy.add(line);
  }
  return {
    proxyHosts: [...proxy].sort(),
    directHosts: [],
    format: "plain-domains",
    rawLineCount,
  };
}

export function parseRemoteListText(body: string): RemoteListParseResult {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("远程列表内容为空");

  const looksBase64 =
    !trimmed.includes("||") &&
    !trimmed.includes("\n!") &&
    !/^[\s]*[a-z0-9].*\./im.test(trimmed.slice(0, 200)) &&
    /^[A-Za-z0-9+/=\s]+$/.test(trimmed);

  if (looksBase64) {
    try {
      const decoded = Buffer.from(
        trimmed.replace(/\s+/g, ""),
        "base64"
      ).toString("utf8");
      const parsed = parseAbpOrAutoproxy(decoded);
      if (parsed.proxyHosts.length === 0) {
        throw new Error("Base64 解码后没有有效域名");
      }
      return { ...parsed, format: "gfwlist-base64" };
    } catch (e) {
      if (e instanceof Error && e.message.includes("有效域名")) throw e;
      throw new Error(
        "列表 Base64 解码失败，请确认 URL 返回的是 GFWList 或明文规则"
      );
    }
  }

  if (
    trimmed.includes("||") ||
    trimmed.includes("@@") ||
    /^!\s/m.test(trimmed)
  ) {
    const parsed = parseAbpOrAutoproxy(trimmed);
    if (parsed.proxyHosts.length > 0) return parsed;
  }

  const plain = parsePlainDomains(trimmed);
  if (plain.proxyHosts.length === 0) {
    throw new Error(
      "未能从远程列表解析出有效域名。请使用 GFWList、AutoProxy 规则或每行一个域名的明文列表。"
    );
  }
  return plain;
}

function collectResponseHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = String(value).slice(0, 512);
  });
  return out;
}

export async function fetchAndParseRemoteList(
  url: string
): Promise<RemoteListParseResult> {
  const unsafe = assertSafeHttpUrl(url, "规则列表 URL");
  if (unsafe) throw new Error(unsafe);

  const requestHeaders = {
    "User-Agent": "genpac-runner/2 (bun)",
    Accept: "text/plain, text/*;q=0.9, */*;q=0.8",
  };

  let lastError: unknown;
  // 远程源偶发断开连接时有限重试；HTTP 错误不重试，避免重复请求无效地址。
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(90_000),
      });
      const duration_ms = Math.max(0, Date.now() - started);
      const text = await res.text();
      const fetchMeta: RemoteListFetchMeta = {
        url,
        method: "GET",
        status: res.status,
        status_text: res.statusText || "",
        duration_ms,
        response_bytes: Buffer.byteLength(text, "utf8"),
        content_type: res.headers.get("content-type") || "",
        attempts: attempt + 1,
        request_headers: { ...requestHeaders },
        response_headers: collectResponseHeaders(res),
      };
      if (!res.ok) {
        const err = new Error(`下载远程列表失败：HTTP ${res.status} ${res.statusText}`) as Error & {
          fetchMeta?: RemoteListFetchMeta;
        };
        err.fetchMeta = fetchMeta;
        throw err;
      }
      const parsed = parseRemoteListText(text);
      return { ...parsed, fetch: fetchMeta };
    } catch (error) {
      lastError = error;
      // HTTP 响应错误和列表格式错误是确定性错误，不应重试。
      if (error instanceof Error && /^(下载远程列表失败：HTTP|远程列表内容为空|未能从远程列表解析|列表 Base64 解码失败)/.test(error.message)) {
        throw error;
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 1000));
      }
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `远程规则列表下载失败：连接意外中断（已重试 2 次）。请检查容器的 DNS、IPv4/IPv6 出口及列表源是否可访问。详情：${detail}`
  );
}

function escapeJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toJsArray(list: string[], compress: boolean): string {
  return list.map((item) => JSON.stringify(item)).join(compress ? "," : ",\n    ");
}

/**
 * 生成 PAC：用户黑名单 / 直连优先，再匹配远程列表。
 */
export function buildRemoteListPac(
  pacProxy: string,
  proxyHosts: string[],
  remoteDirectHosts: string[],
  userBlockList: string[],
  userDirectList: string[],
  compress: boolean
): string {
  const proxyObj = proxyHosts
    .map((h) => `"${escapeJsString(h)}":1`)
    .join(compress ? "," : ",\n  ");
  const remoteDirectObj = remoteDirectHosts
    .map((h) => `"${escapeJsString(h)}":1`)
    .join(compress ? "," : ",\n  ");
  const blockJs = toJsArray(userBlockList, false);
  const directJs = toJsArray(userDirectList, false);

  const body = `// genpac-runner 生成的 PAC（远程规则列表与自定义规则）
// 远程代理域名：${proxyHosts.length} 条；远程例外直连：${remoteDirectHosts.length} 条
// 自定义黑名单：${userBlockList.length} 条；自定义直连：${userDirectList.length} 条

var PROXY = ${JSON.stringify(pacProxy)};
var DIRECT = "DIRECT";
var BLOCK = "PROXY 0.0.0.0:0";

var USER_BLOCK = [\n    ${blockJs}\n];
var USER_DIRECT = [\n    ${directJs}\n];
var proxyHosts = {\n  ${proxyObj}\n};
var remoteDirect = {\n  ${remoteDirectObj}\n};

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

function hostInMap(host, map) {
  var h = host.toLowerCase();
  var parts = h.split(".");
  for (var i = 0; i < parts.length; i++) {
    var suffix = parts.slice(i).join(".");
    if (map[suffix]) return true;
  }
  return false;
}

function FindProxyForURL(url, host) {
  if (
    host === "localhost" ||
    host.indexOf(".") === -1 ||
    isInNet(host, "127.0.0.0", "255.0.0.0") ||
    isInNet(host, "10.0.0.0", "255.0.0.0") ||
    isInNet(host, "172.16.0.0", "255.240.0.0") ||
    isInNet(host, "192.168.0.0", "255.255.0.0")
  ) {
    return DIRECT;
  }
  // 用户自定义：始终优先
  if (USER_BLOCK.length && isMatch(host, USER_BLOCK)) return BLOCK;
  if (USER_DIRECT.length && isMatch(host, USER_DIRECT)) return DIRECT;
  // 远程列表例外与代理域名
  if (remoteDirect && hostInMap(host, remoteDirect)) return DIRECT;
  if (proxyHosts && hostInMap(host, proxyHosts)) return PROXY;
  return DIRECT;
}
`;

  return body;
}
