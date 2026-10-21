import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import { getSettings, updateSettings } from "../db/sqlite";
import { getMonitorSummary, listAccessEvents, listProxyProbeRuns } from "../db/monitoring";
import { requireAdmin } from "../middleware/auth";
import { getActiveRequestCount, getTcpConnectionCount } from "../services/request-monitor";
import {
  DEFAULT_PROXY_TEST_URL,
  parseProxyTestUrl,
  ProxyProbeError,
} from "../services/proxy-probe";

export function adminMonitorRoutes(database: AppDatabase): Router {
  const router = Router();
  const proxyErrorResponse = (error: unknown) =>
    error instanceof ProxyProbeError
      ? { errorCode: error.code, errorDetail: error.detail }
      : { error: error instanceof Error ? error.message : String(error) };

  router.get("/api/admin/monitor/summary", requireAdmin(database), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = getMonitorSummary(database, getActiveRequestCount(), getTcpConnectionCount());
    res.json({ ...summary, timezone: getSettings(database).timezone });
  });

  router.get("/api/admin/monitor/access", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const paged = String(req.query.paged ?? "") === "1";
    const limit = Math.min(
      paged ? 100 : 200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const rows = listAccessEvents(database, paged ? limit + 1 : limit, beforeId);
    if (!paged) {
      res.json(rows);
      return;
    }
    const hasMore = rows.length > limit;
    const total = Number(
      (database.query("SELECT COUNT(*) AS total FROM access_events").get() as { total: number })
        .total
    );
    res.json({
      items: rows.slice(0, limit),
      nextCursor:
        rows.length > limit ? (rows[limit - 1]?.id ?? null) : (rows[rows.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });

  router.get("/api/admin/monitor/probes", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const paged = String(req.query.paged ?? "") === "1";
    const limit = Math.min(
      paged ? 100 : 200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "30"), 10) || 30)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const rows = listProxyProbeRuns(database, paged ? limit + 1 : limit, beforeId);
    if (!paged) {
      res.json(rows);
      return;
    }
    const hasMore = rows.length > limit;
    const total = Number(
      (database.query("SELECT COUNT(*) AS total FROM proxy_probe_runs").get() as { total: number })
        .total
    );
    res.json({
      items: rows.slice(0, limit),
      nextCursor:
        rows.length > limit ? (rows[limit - 1]?.id ?? null) : (rows[rows.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });

  router.get("/api/admin/monitor/probe-target", requireAdmin(database), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ url: getSettings(database).proxyTestUrl || DEFAULT_PROXY_TEST_URL });
  });

  router.put("/api/admin/monitor/probe-target", requireAdmin(database), (req, res) => {
    let target: URL;
    try {
      target = parseProxyTestUrl(String(req.body?.url ?? ""));
    } catch (error) {
      res.status(400).json(proxyErrorResponse(error));
      return;
    }
    const next = updateSettings(database, { proxyTestUrl: target.toString() });
    res.json({ url: next.proxyTestUrl });
  });

  return router;
}
