import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { getMonitorSummary, listAccessEvents } from "../db/monitoring";
import { requireAdmin } from "../middleware/auth";
import { getActiveRequestCount, getTcpConnectionCount } from "../services/request-monitor";
export function adminMonitorRoutes(database: AppDatabase): Router {
  const router = Router();
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


  return router;
}
