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
}

let lastPruneAt = 0;

export function recordAccessEvent(database: AppDatabase, event: AccessEventInput): void {
  database.query(
    "INSERT INTO access_events " +
    "(created_at, method, path, category, source_ip, user_agent, status_code, duration_ms, response_bytes) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    event.created_at,
    event.method,
    event.path,
    event.category,
    event.source_ip,
    event.user_agent,
    event.status_code,
    event.duration_ms,
    event.response_bytes
  );

  maybePruneMonitoringData(database);
}

export function listAccessEvents(database: AppDatabase, requestedLimit = 50): AccessEvent[] {
  maybePruneMonitoringData(database);
  const limit = Math.max(1, Math.min(200, Math.trunc(requestedLimit) || 50));
  return database.query(
    "SELECT id, created_at, method, path, category, source_ip, user_agent, status_code, duration_ms, response_bytes " +
    "FROM access_events ORDER BY id DESC LIMIT ?"
  ).all(limit) as AccessEvent[];
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

  const hour = database.query(
    "SELECT COUNT(*) AS total FROM access_events WHERE created_at >= ?"
  ).get(hourAgo) as { total: number } | null;

  const day = database.query(
    "SELECT COUNT(*) AS total, " +
    "COUNT(DISTINCT CASE WHEN source_ip <> 'unknown' THEN source_ip END) AS sources, " +
    "SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors, " +
    "SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS server_errors, " +
    "AVG(duration_ms) AS average_ms " +
    "FROM access_events WHERE created_at >= ?"
  ).get(dayAgo) as {
    total: number;
    sources: number;
    errors: number | null;
    server_errors: number | null;
    average_ms: number | null;
  } | null;

  // 只取最近 5,000 条请求计算分位数，避免高流量时扫描和加载全部历史记录。
  const durations = database.query(
    "SELECT duration_ms FROM access_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5000"
  ).all(dayAgo) as Array<{ duration_ms: number }>;
  durations.sort((a, b) => a.duration_ms - b.duration_ms);

  const hourlyRows = database.query(
    "SELECT substr(created_at, 1, 13) AS hour_key, COUNT(*) AS total, " +
    "SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors " +
    "FROM access_events WHERE created_at >= ? GROUP BY hour_key"
  ).all(dayAgo) as Array<{ hour_key: string; total: number; errors: number | null }>;
  const hourlyByKey = new Map(hourlyRows.map((row) => [
    row.hour_key,
    { requests: Number(row.total), errors: Number(row.errors ?? 0) },
  ]));
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
    activeRequests: Math.max(0, activeRequests),
    tcpConnections: Math.max(0, tcpConnections),
    requestsLastHour: Number(hour?.total ?? 0),
    requestsLast24h: total,
    uniqueSourcesLast24h: Number(day?.sources ?? 0),
    errorRequestsLast24h: errors,
    serverErrorsLast24h: Number(day?.server_errors ?? 0),
    averageResponseMs: Math.round(Number(day?.average_ms ?? 0) * 10) / 10,
    p95ResponseMs: p95Index >= 0 ? Math.round(Number(durations[p95Index].duration_ms) * 10) / 10 : 0,
    errorRate: total > 0 ? Math.round((errors / total) * 1000) / 10 : 0,
  };
}

export function recordProxyProbe(database: AppDatabase, item: ProxyProbeInput): void {
  database.query(
    "INSERT INTO proxy_probe_runs " +
    "(tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
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

export function listProxyProbeRuns(database: AppDatabase, requestedLimit = 30): ProxyProbeRecord[] {
  maybePruneMonitoringData(database);
  const limit = Math.max(1, Math.min(200, Math.trunc(requestedLimit) || 30));
  const rows = database.query(
    "SELECT id, tested_at, proxy_label, proxy_host, proxy_port, target_host, success, tcp_ms, handshake_ms, target_ms, http_status, phase, error " +
    "FROM proxy_probe_runs ORDER BY id DESC LIMIT ?"
  ).all(limit) as Array<Omit<ProxyProbeRecord, "success"> & { success: number }>;
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
  database.query(
    "DELETE FROM access_events WHERE id NOT IN (SELECT id FROM access_events ORDER BY id DESC LIMIT 5000)"
  ).run();
  database.query("DELETE FROM proxy_probe_runs WHERE tested_at < ?").run(cutoff);
  database.query(
    "DELETE FROM proxy_probe_runs WHERE id NOT IN (SELECT id FROM proxy_probe_runs ORDER BY id DESC LIMIT 1000)"
  ).run();
}
