import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { ApplicationStorage } from "../storage/repositories";
import { requireAdmin } from "../middleware/auth";
import { getActiveRequestCount, getTcpConnectionCount } from "../services/request-monitor";
export function adminMonitorRoutes(database: AppDatabase, storage: ApplicationStorage): Router {
  const router = Router();
  router.get("/api/admin/monitor/summary", requireAdmin(storage.credentials), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = storage.monitoring.summarize(getActiveRequestCount(), getTcpConnectionCount());
    res.json({ ...summary, timezone: storage.settings.get().timezone });
  });

  router.get("/api/admin/monitor/access", requireAdmin(storage.credentials), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const paged = String(req.query.paged ?? "") === "1";
    const limit = Math.min(
      paged ? 100 : 200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const rows = storage.monitoring.list(paged ? limit + 1 : limit, beforeId);
    if (!paged) {
      res.json(rows);
      return;
    }
    const hasMore = rows.length > limit;
    const total = storage.monitoring.count();
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
