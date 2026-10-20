import type { AppDatabase } from "./sqlite";

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
}

export interface ProxyProbeRecord extends Omit<ProxyProbeInput, "success"> {
  id: number;
  success: boolean;
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
        "(tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
      item.error.slice(0, 500)
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
    "SELECT id, tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error " +
    "FROM proxy_probe_runs" +
    where +
    " ORDER BY id DESC LIMIT ?";
  const rows = (
    cursor > 0 ? database.query(query).all(cursor, limit) : database.query(query).all(limit)
  ) as Array<Omit<ProxyProbeRecord, "success"> & { success: number }>;
  return rows.map((row) => ({ ...row, success: Boolean(row.success) }));
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
