import type { Request, Response, NextFunction } from "express";
import type { Socket } from "node:net";
import { performance } from "node:perf_hooks";
import type { AppDatabase } from "../db/sqlite";
import { recordAccessEvent } from "../db/monitoring";

const tcpSockets = new Set<Socket>();
let activeRequests = 0;

/** Headers that must never be persisted (credentials / session material). */
const BLOCKED_HEADER = /^(cookie|cookie2|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token|x-access-token)$/i;

/**
 * Common diagnostic headers worth keeping. Others are dropped to limit size
 * and avoid accidental capture of custom secret headers.
 */
const ALLOWED_HEADER =
  /^(host|user-agent|accept|accept-language|accept-encoding|accept-charset|content-type|content-length|origin|referer|range|if-none-match|if-modified-since|cache-control|connection|upgrade-insecure-requests|sec-fetch-site|sec-fetch-mode|sec-fetch-dest|sec-fetch-user|sec-ch-ua|sec-ch-ua-mobile|sec-ch-ua-platform|dnt|te|priority|x-forwarded-for|x-forwarded-proto|x-real-ip|x-request-id)$/i;

export function trackTcpConnection(socket: Socket): void {
  tcpSockets.add(socket);
  socket.once("close", () => tcpSockets.delete(socket));
}

export function getActiveRequestCount(): number {
  return activeRequests;
}

export function getTcpConnectionCount(): number {
  return tcpSockets.size;
}

export function requestMonitoringMiddleware(database: AppDatabase) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || "/";
    if (!shouldRecord(path)) {
      next();
      return;
    }

    activeRequests += 1;
    const startedAt = performance.now();
    let recorded = false;

    const finish = (aborted: boolean): void => {
      if (recorded) return;
      recorded = true;
      activeRequests = Math.max(0, activeRequests - 1);

      const elapsed = Math.max(0, performance.now() - startedAt);
      const contentLength = Number(res.getHeader("content-length") ?? 0);
      const remoteAddress = normalizeAddress(req.socket.remoteAddress || "");
      const agent = headerValue(req, "user-agent").slice(0, 512);
      const statusCode = aborted && !res.writableFinished ? 499 : res.statusCode;
      const responseType = String(res.getHeader("content-type") || "")
        .replace(/[\r\n\t]/g, " ")
        .slice(0, 200);

      try {
        recordAccessEvent(database, {
          created_at: new Date().toISOString(),
          method: req.method.slice(0, 12),
          path: safePath(path),
          category: categorize(path),
          source_ip: remoteAddress,
          user_agent: agent,
          status_code: statusCode,
          duration_ms: Math.round(elapsed * 10) / 10,
          response_bytes: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0,
          query_string: extractQuery(req),
          host: headerValue(req, "host").slice(0, 253),
          referer: headerValue(req, "referer").slice(0, 1024),
          accept: headerValue(req, "accept").slice(0, 256),
          accept_language: headerValue(req, "accept-language").slice(0, 128),
          content_type: headerValue(req, "content-type").slice(0, 200),
          request_headers: collectHeaders(req),
          response_content_type: responseType,
        });
      } catch (error) {
        console.warn("[monitor] 无法写入访问记录:", error instanceof Error ? error.message : String(error));
      }
    };

    res.once("finish", () => finish(false));
    res.once("close", () => finish(true));
    next();
  };
}

function shouldRecord(path: string): boolean {
  // 监控、存储刷新与日志清理接口不计入访问统计，避免统计/清理操作反过来污染自身结果。
  if (path.startsWith("/api/admin/monitor/")) return false;
  if (path === "/api/admin/storage" || path === "/api/admin/logs/cleanup" || path === "/api/admin/logs/clear") return false;
  // 静态资源与浏览器图标请求很多，但不代表独立页面访问。
  if (path.startsWith("/assets/") || path === "/favicon.ico") return false;
  if (/\.(?:js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i.test(path)) return false;
  return true;
}

function categorize(path: string): string {
  if (path === "/proxy.pac") return "pac";
  if (path.startsWith("/api/admin/")) return "admin-api";
  if (path.startsWith("/api/")) return "public-api";
  return "page";
}

function safePath(path: string): string {
  // req.path 不包含 query string；保留较长路径，同时限制长度避免异常请求放大数据库。
  return path.slice(0, 1024) || "/";
}

function normalizeAddress(address: string): string {
  const value = address.trim();
  if (!value) return "unknown";
  if (value.startsWith("::ffff:")) return value.slice(7);
  if (value === "::1") return "127.0.0.1";
  return value.slice(0, 64);
}

function headerValue(req: Request, name: string): string {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw.join(", ").replace(/[\r\n\t]/g, " ").trim();
  return String(raw || "").replace(/[\r\n\t]/g, " ").trim();
}

function extractQuery(req: Request): string {
  const original = String(req.originalUrl || req.url || "");
  const idx = original.indexOf("?");
  if (idx < 0) return "";
  // Cap length; do not parse individual secrets — operators still see the raw query for diagnosis.
  return original.slice(idx + 1, idx + 1 + 512);
}

function collectHeaders(req: Request): string {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (BLOCKED_HEADER.test(name)) continue;
    if (!ALLOWED_HEADER.test(name)) continue;
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    out[name.toLowerCase()] = text.replace(/[\r\n\t]/g, " ").trim().slice(0, 512);
  }
  try {
    const json = JSON.stringify(out);
    return json.length > 4000 ? json.slice(0, 4000) : json;
  } catch {
    return "{}";
  }
}
