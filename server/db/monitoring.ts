import type { AppDatabase } from "./sqlite";
import type { LocalizedParams } from "./sqlite";

export interface AccessEventInput {
  created_at: string;
  method: string;
  path: string;
  category: string;
  source_ip: string;
  user_agent: string;
  status_code: number;
  duration_ms: number;
  response_bytes: number;
  /** Raw query string without leading `?`, length-capped. */
  query_string: string;
  host: string;
  referer: string;
  accept: string;
  accept_language: string;
  content_type: string;
  /** JSON object of sanitized request headers (no cookies/credentials). */
  request_headers: string;
  response_content_type: string;
}

export interface AccessEvent extends AccessEventInput {
  id: number;
}

export interface ProxyProbeInput {
  tested_at: string;
  proxy_label: string;
  proxy_host: string;
  proxy_port: number;
  target_host: string;
  success: boolean;
  tcp_ms: number | null;
  handshake_ms: number | null;
  target_ms: number | null;
  http_status: number | null;
  phase: string;
  error: string;
  error_key?: string;
  error_params?: LocalizedParams;
}

export interface ProxyProbeRecord extends Omit<ProxyProbeInput, "success"> {
  id: number;
  success: boolean;
  error_params: LocalizedParams;
}

export interface MonitorSummary {
  generatedAt: string;
  activeRequests: number;
  tcpConnections: number;
  requestsLastHour: number;
  requestsLast24h: number;
  uniqueSourcesLast24h: number;
  errorRequestsLast24h: number;
  serverErrorsLast24h: number;
  averageResponseMs: number;
  p95ResponseMs: number;
  errorRate: number;
  requestTrend: Array<{ hour: string; requests: number; errors: number }>;
  pacRequestsLastHour: number;
  pacRequestsLast24h: number;
  pacSuccessRate: number;
  pacFailureRequestsLast24h: number;
  pacAverageResponseMs: number;
  latestPacRequest: {
    created_at: string;
    source_ip: string;
    status_code: number;
    duration_ms: number;
  } | null;
  pacRequestTrend: Array<{
    hour: string;
    requests: number;
    errors: number;
    averageResponseMs: number;
  }>;
}

let lastPruneAt = 0;

export function recordAccessEvent(database: AppDatabase, event: AccessEventInput): void {
  database
    .query(
      "INSERT INTO access_events " +
        "(created_at, method, path, category, source_ip, user_agent, status_code, duration_ms, response_bytes, " +
        "query_string, host, referer, accept, accept_language, content_type, request_headers, response_content_type) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      event.created_at,
      event.method,
      event.path,
      event.category,
      event.source_ip,
      event.user_agent,
      event.status_code,
      event.duration_ms,
      event.response_bytes,
      event.query_string || "",
      event.host || "",
      event.referer || "",
      event.accept || "",
      event.accept_language || "",
      event.content_type || "",
      event.request_headers || "",
      event.response_content_type || ""
    );

  maybePruneMonitoringData(database);
}

export function listAccessEvents(
  database: AppDatabase,
  requestedLimit = 50,
  beforeId = 0
): AccessEvent[] {
  maybePruneMonitoringData(database);
  const limit = Math.max(1, Math.min(201, Math.trunc(requestedLimit) || 50));
  const cursor = Math.max(0, Math.trunc(beforeId) || 0);
  const where = cursor > 0 ? " WHERE id < ?" : "";
  const query =
    "SELECT id, created_at, method, path, category, source_ip, user_agent, status_code, duration_ms, response_bytes, " +
    "COALESCE(query_string, '') AS query_string, COALESCE(host, '') AS host, COALESCE(referer, '') AS referer, " +
    "COALESCE(accept, '') AS accept, COALESCE(accept_language, '') AS accept_language, " +
    "COALESCE(content_type, '') AS content_type, COALESCE(request_headers, '') AS request_headers, " +
    "COALESCE(response_content_type, '') AS response_content_type " +
    "FROM access_events" +
    where +
    " ORDER BY id DESC LIMIT ?";
  return (
    cursor > 0 ? database.query(query).all(cursor, limit) : database.query(query).all(limit)
  ) as AccessEvent[];
}

export function getMonitorSummary(
  database: AppDatabase,
  activeRequests: number,
  tcpConnections: number
): MonitorSummary {
  maybePruneMonitoringData(database);
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const hour = database
    .query("SELECT COUNT(*) AS total FROM access_events WHERE created_at >= ?")
    .get(hourAgo) as { total: number } | null;

  const day = database
    .query(
      "SELECT COUNT(*) AS total, " +
        "COUNT(DISTINCT CASE WHEN source_ip <> 'unknown' THEN source_ip END) AS sources, " +
        "SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors, " +
        "SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS server_errors, " +
        "AVG(duration_ms) AS average_ms " +
        "FROM access_events WHERE created_at >= ?"
    )
    .get(dayAgo) as {
    total: number;
    sources: number;
    errors: number | null;
    server_errors: number | null;
    average_ms: number | null;
  } | null;

  // 只取最近 5,000 条请求计算分位数，避免高流量时扫描和加载全部历史记录。
  const durations = database
    .query(
      "SELECT duration_ms FROM access_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5000"
    )
    .all(dayAgo) as Array<{ duration_ms: number }>;
  durations.sort((a, b) => a.duration_ms - b.duration_ms);

  const hourlyRows = database
    .query(
      "SELECT substr(created_at, 1, 13) AS hour_key, COUNT(*) AS total, " +
        "SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors " +
        "FROM access_events WHERE created_at >= ? GROUP BY hour_key"
    )
    .all(dayAgo) as Array<{ hour_key: string; total: number; errors: number | null }>;

  // PAC 文件本身是本服务的核心指标，独立统计 /proxy.pac，避免网页和管理 API 混入。
  const pacDay = database
    .query(
      "SELECT COUNT(*) AS total, " +
        "SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) AS successful, " +
        "SUM(CASE WHEN status_code >= 400 OR status_code < 200 THEN 1 ELSE 0 END) AS failures, " +
        "AVG(duration_ms) AS average_ms " +
        "FROM access_events WHERE category = 'pac' AND created_at >= ?"
    )
    .get(dayAgo) as {
    total: number;
    successful: number | null;
    failures: number | null;
    average_ms: number | null;
  } | null;
  const pacHour = database
    .query("SELECT COUNT(*) AS total FROM access_events WHERE category = 'pac' AND created_at >= ?")
    .get(hourAgo) as { total: number } | null;
  const latestPacRequest = database
    .query(
      "SELECT created_at, source_ip, status_code, duration_ms FROM access_events " +
        "WHERE category = 'pac' ORDER BY id DESC LIMIT 1"
    )
    .get() as {
    created_at: string;
    source_ip: string;
    status_code: number;
    duration_ms: number;
  } | null;
  const pacHourlyRows = database
    .query(
      "SELECT substr(created_at, 1, 13) AS hour_key, COUNT(*) AS total, " +
        "SUM(CASE WHEN status_code >= 400 OR status_code < 200 THEN 1 ELSE 0 END) AS errors, " +
        "AVG(duration_ms) AS average_ms " +
        "FROM access_events WHERE category = 'pac' AND created_at >= ? GROUP BY hour_key"
    )
    .all(dayAgo) as Array<{
    hour_key: string;
    total: number;
    errors: number | null;
    average_ms: number | null;
  }>;
  const pacHourlyByKey = new Map(
    pacHourlyRows.map((row) => [
      row.hour_key,
      {
        requests: Number(row.total),
        errors: Number(row.errors ?? 0),
        averageResponseMs: Math.round(Number(row.average_ms ?? 0) * 10) / 10,
      },
    ])
  );
  const hourlyByKey = new Map(
    hourlyRows.map((row) => [
      row.hour_key,
      { requests: Number(row.total), errors: Number(row.errors ?? 0) },
    ])
  );
  const currentHour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
  const requestTrend = Array.from({ length: 24 }, (_, index) => {
    const slot = new Date(currentHour - (23 - index) * 60 * 60 * 1000);
    const key = slot.toISOString().slice(0, 13);
    const values = hourlyByKey.get(key);
    return {
      hour: slot.toISOString(),
      requests: values?.requests ?? 0,
      errors: values?.errors ?? 0,
    };
  });

  const p95Index = durations.length ? Math.max(0, Math.ceil(durations.length * 0.95) - 1) : -1;
  const total = Number(day?.total ?? 0);
  const errors = Number(day?.errors ?? 0);

  return {
    generatedAt: new Date(now).toISOString(),
    requestTrend,
    pacRequestsLastHour: Number(pacHour?.total ?? 0),
    pacRequestsLast24h: Number(pacDay?.total ?? 0),
    pacSuccessRate:
      Number(pacDay?.total ?? 0) > 0
        ? Math.round((Number(pacDay?.successful ?? 0) / Number(pacDay?.total ?? 0)) * 1000) / 10
        : 100,
    pacFailureRequestsLast24h: Number(pacDay?.failures ?? 0),
    pacAverageResponseMs: Math.round(Number(pacDay?.average_ms ?? 0) * 10) / 10,
    latestPacRequest: latestPacRequest ?? null,
    pacRequestTrend: Array.from({ length: 24 }, (_, index) => {
      const slot = new Date(currentHour - (23 - index) * 60 * 60 * 1000);
      const key = slot.toISOString().slice(0, 13);
      const values = pacHourlyByKey.get(key);
      return {
        hour: slot.toISOString(),
        requests: values?.requests ?? 0,
        errors: values?.errors ?? 0,
        averageResponseMs: values?.averageResponseMs ?? 0,
      };
    }),
    activeRequests: Math.max(0, activeRequests),
    tcpConnections: Math.max(0, tcpConnections),
    requestsLastHour: Number(hour?.total ?? 0),
    requestsLast24h: total,
    uniqueSourcesLast24h: Number(day?.sources ?? 0),
    errorRequestsLast24h: errors,
    serverErrorsLast24h: Number(day?.server_errors ?? 0),
    averageResponseMs: Math.round(Number(day?.average_ms ?? 0) * 10) / 10,
    p95ResponseMs:
      p95Index >= 0 ? Math.round(Number(durations[p95Index].duration_ms) * 10) / 10 : 0,
    errorRate: total > 0 ? Math.round((errors / total) * 1000) / 10 : 0,
  };
}

export function recordProxyProbe(database: AppDatabase, item: ProxyProbeInput): void {
  database
    .query(
      "INSERT INTO proxy_probe_runs " +
        "(tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error, error_key, error_params) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      item.tested_at,
      item.proxy_label,
      item.proxy_host,
      item.proxy_port,
      item.target_host,
      item.success ? 1 : 0,
      item.tcp_ms,
      item.handshake_ms,
      item.target_ms,
      item.http_status,
      item.phase,
      item.error.slice(0, 500),
      item.error_key ?? "",
      JSON.stringify(item.error_params ?? {})
    );

  maybePruneMonitoringData(database);
}

export function listProxyProbeRuns(
  database: AppDatabase,
  requestedLimit = 30,
  beforeId = 0
): ProxyProbeRecord[] {
  maybePruneMonitoringData(database);
  const limit = Math.max(1, Math.min(201, Math.trunc(requestedLimit) || 30));
  const cursor = Math.max(0, Math.trunc(beforeId) || 0);
  const where = cursor > 0 ? " WHERE id < ?" : "";
  const query =
    "SELECT id, tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error, error_key, error_params " +
    "FROM proxy_probe_runs" +
    where +
    " ORDER BY id DESC LIMIT ?";
  const rows = (
    cursor > 0 ? database.query(query).all(cursor, limit) : database.query(query).all(limit)
  ) as Array<Omit<ProxyProbeRecord, "success" | "error_params"> & { success: number; error_params: string }>;
  return rows.map((row) => {
    let errorParams: LocalizedParams = {};
    try {
      const parsed: unknown = JSON.parse(row.error_params);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        errorParams = Object.fromEntries(
          Object.entries(parsed).filter(
            ([, value]) => typeof value === "string" || typeof value === "number"
          )
        ) as LocalizedParams;
      }
    } catch {
      errorParams = {};
    }
    const legacyIssue = row.error_key ? null : legacyProxyProbeError(row.error);
    return {
      ...row,
      success: Boolean(row.success),
      error_key: row.error_key || legacyIssue?.key || "",
      error_params: row.error_key ? errorParams : (legacyIssue?.params ?? errorParams),
    };
  });
}

function legacyProxyProbeError(
  message: string
): { key: string; params: LocalizedParams } | null {
  const exact: Record<string, string> = {
    "代理测试地址不能为空。": "urlRequired",
    "代理测试地址不能包含空白字符或控制字符；请检查 URL 编码。": "urlWhitespace",
    "代理测试地址格式无效，请填写完整的 HTTPS URL，例如 https://www.google.com/generate_204。":
      "urlInvalid",
    "代理测试地址目前只支持 HTTPS URL。": "urlHttpsOnly",
    "代理测试地址必须包含主机名，且不能包含用户名或密码。": "urlCredentials",
    "代理测试地址不能包含 URL 片段（# 后的内容）。": "urlFragment",
    "代理认证信息格式无效，请使用 username:password@host:port。": "proxyAuthFormat",
    "IPv6 代理地址必须使用 [地址]:端口 格式。": "proxyIpv6Format",
    "目标站点返回了无法识别的 HTTP 响应。": "targetHttpInvalid",
    "单个代理的检测总耗时超过 12 秒，已终止。": "totalTimeout",
    "代理未返回有效的 HTTP CONNECT 状态行。": "connectStatusInvalid",
    "SOCKS5 握手版本不正确。": "socks5VersionInvalid",
    "SOCKS5 用户名或密码过长。": "socks5CredentialsTooLong",
    "SOCKS5 用户名或密码认证失败。": "socks5AuthFailed",
    "SOCKS5 代理要求用户名/密码，但配置中未提供认证信息。": "socks5AuthRequired",
    "测试目标域名过长。": "targetDomainTooLong",
    "SOCKS5 代理返回了无效响应。": "socks5ResponseInvalid",
    "SOCKS5 响应使用了未知地址类型。": "socks5AddressTypeUnknown",
    "检测环境无法将目标域名解析为 IPv4，无法进行 SOCKS4 测试。": "socks4DnsFailed",
    "目标 DNS 未返回有效的 IPv4 地址，无法进行 SOCKS4 测试。": "socks4DnsInvalid",
    "SOCKS4 代理返回了无效响应。": "socks4ResponseInvalid",
    "SOCKS4a 代理返回了无效响应。": "socks4aResponseInvalid",
    "PAC 代理字符串为空。": "proxyStringEmpty",
    "PAC 代理字符串中只有 DIRECT，没有可测试的代理节点。": "onlyDirect",
    "连接代理端口超时。": "tcpTimeout",
    "TLS 握手超时。": "tlsTimeout",
    "等待 SOCKS5 目标连接响应超时。": "socks5ResponseTimeout",
    "SOCKS5 代理在返回完整响应前关闭了连接。": "socks5ConnectionClosed",
    "等待代理响应超时。": "proxyResponseTimeout",
    "代理在返回完整响应前关闭了连接。": "proxyConnectionClosed",
    "等待 HTTP 响应头超时。": "httpHeaderTimeout",
    "HTTP 响应头超过 16 KiB，已终止检测。": "httpHeaderTooLarge",
    "连接在返回 HTTP 响应头前关闭。": "httpHeaderConnectionClosed",
  };
  const key = exact[message];
  if (key) return { key: `monitor.probeErrors.${key}`, params: {} };
  const patterns: Array<[RegExp, string, (match: RegExpExecArray) => LocalizedParams]> = [
    [/^代理地址缺少端口：(.*)$/, "proxyPortMissing", (m) => ({ address: m[1] })],
    [/^代理地址或端口无效：(.*)$/, "proxyAddressInvalid", (m) => ({ address: m[1] })],
    [/^无法连接代理端口：(.*)$/, "tcpFailed", (m) => ({ error: m[1] })],
    [/^TLS 握手失败：(.*)$/, "tlsFailed", (m) => ({ error: m[1] })],
    [/^SOCKS5 连接中断：(.*)$/, "socks5ConnectionInterrupted", (m) => ({ error: m[1] })],
    [/^代理连接中断：(.*)$/, "proxyConnectionInterrupted", (m) => ({ error: m[1] })],
    [/^读取 HTTP 响应失败：(.*)$/, "httpReadFailed", (m) => ({ error: m[1] })],
    [
      /^目标站点返回 HTTP (\d+)。代理隧道和 TLS 已建立，但目标请求未成功。$/,
      "targetHttpStatus",
      (m) => ({ status: Number(m[1]) }),
    ],
    [/^代理 CONNECT 返回 HTTP (\d+)。$/, "connectHttpStatus", (m) => ({ status: Number(m[1]) })],
    [
      /^SOCKS5 代理没有接受支持的认证方式（method (\d+)）。$/,
      "socks5AuthMethodUnsupported",
      (m) => ({ method: Number(m[1]) }),
    ],
    [
      /^SOCKS5 目标连接失败：.*?(?:错误码 )?(\d+)。$/,
      "socks5ConnectFailed",
      (m) => ({ code: Number(m[1]) }),
    ],
    [
      /^SOCKS4 目标连接失败：.*?(?:响应码 )?(\d+)。$/,
      "socks4ConnectFailed",
      (m) => ({ code: Number(m[1]) }),
    ],
    [
      /^SOCKS4a 目标连接失败：.*?(?:响应码 )?(\d+)。$/,
      "socks4aConnectFailed",
      (m) => ({ code: Number(m[1]) }),
    ],
  ];
  for (const [pattern, patternKey, params] of patterns) {
    const match = pattern.exec(message);
    if (match) return { key: `monitor.probeErrors.${patternKey}`, params: params(match) };
  }
  return null;
}

function maybePruneMonitoringData(database: AppDatabase): void {
  const now = Date.now();
  if (now - lastPruneAt < 60 * 60 * 1000) return;
  lastPruneAt = now;
  pruneMonitoringData(database);
}

function pruneMonitoringData(database: AppDatabase): void {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoff);
  database
    .query(
      "DELETE FROM access_events WHERE id NOT IN (SELECT id FROM access_events ORDER BY id DESC LIMIT 5000)"
    )
    .run();
  database.query("DELETE FROM proxy_probe_runs WHERE tested_at < ?").run(cutoff);
  database
    .query(
      "DELETE FROM proxy_probe_runs WHERE id NOT IN (SELECT id FROM proxy_probe_runs ORDER BY id DESC LIMIT 1000)"
    )
    .run();
}
