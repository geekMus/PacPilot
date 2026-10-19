import type { Request, Response, NextFunction } from "express";
import type { Socket } from "node:net";
import { performance } from "node:perf_hooks";
import type { AppDatabase } from "../db/sqlite";
import { recordAccessEvent } from "../db/monitoring";

const tcpSockets = new Set<Socket>();
let activeRequests = 0;

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
      const agent = String(req.headers["user-agent"] || "")
        .replace(/[\r\n\t]/g, " ")
        .slice(0, 512);
      const statusCode = aborted && !res.writableFinished ? 499 : res.statusCode;

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
  // 监控页面的轮询接口不计入访问统计，避免监控面板把自己的轮询当成访客流量。
  if (path.startsWith("/api/admin/monitor/")) return false;
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
