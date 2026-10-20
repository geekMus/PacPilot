import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import {
  cancelPendingWorkflow,
  clearWorkflowHistory,
  deleteWorkflowRun,
  getCurrentWorkflow,
  getSettings,
  getWorkflowRun,
  listActiveWorkflowRuns,
  listWorkflowRuns,
  listWorkflowStages,
} from "../db/sqlite";
import { requireAdmin } from "../middleware/auth";
import { t } from "../../shared/i18n";

export function adminWorkflowRoutes(database: AppDatabase): Router {
  const router = Router();
  const errorText = (key: string) => t(getSettings(database).locale, key);

  router.get("/api/admin/workflows", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const page = listWorkflowRuns(database, limit + 1, beforeId);
    const total = Number(
      (database.query("SELECT COUNT(*) AS total FROM workflow_runs").get() as { total: number })
        .total
    );
    const hasMore = page.length > limit;
    res.json({
      current: getCurrentWorkflow(database),
      active: listActiveWorkflowRuns(database),
      runs: page.slice(0, limit),
      beforeId,
      nextCursor:
        page.length > limit ? (page[limit - 1]?.id ?? null) : (page[page.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });

  router.delete("/api/admin/workflows", requireAdmin(database), (_req, res) => {
    try {
      const result = clearWorkflowHistory(database);
      if (result.activeRuns > 0) {
        res.status(409).json({
          error: errorText("serverErrors.activeWorkflowHistory"),
          activeRuns: result.activeRuns,
        });
        return;
      }
      if (result.deletedRuns > 0) database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
      res.json({ ok: true, deletedRuns: result.deletedRuns });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/api/admin/workflows/:id", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: errorText("serverErrors.invalidWorkflowId") });
      return;
    }
    const run = getWorkflowRun(database, id);
    if (!run) {
      res.status(404).json({ error: errorText("serverErrors.workflowNotFound") });
      return;
    }
    res.json({ run, stages: listWorkflowStages(database, id) });
  });

  router.post("/api/admin/workflows/:id/cancel", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: errorText("serverErrors.invalidWorkflowId") });
      return;
    }
    const result = cancelPendingWorkflow(database, id);
    if (result === "not-found") {
      res.status(404).json({ error: errorText("serverErrors.workflowNotFound") });
      return;
    }
    if (result === "not-pending") {
      res.status(409).json({ error: errorText("serverErrors.workflowCannotCancel") });
      return;
    }
    res.json({ ok: true, id, status: "cancelled" });
  });

  router.delete("/api/admin/workflows/:id", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: errorText("serverErrors.invalidWorkflowId") });
      return;
    }
    const result = deleteWorkflowRun(database, id);
    if (result === "not-found") {
      res.status(404).json({ error: errorText("serverErrors.workflowNotFound") });
      return;
    }
    if (result === "active") {
      res.status(409).json({ error: errorText("serverErrors.workflowCannotDelete") });
      return;
    }
    res.json({ ok: true, id });
  });

  return router;
}
