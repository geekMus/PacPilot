import { Router } from "express";
import type { ApplicationStorage } from "../storage/repositories";
import { requireAdmin } from "../middleware/auth";
import { resolveLocale, t } from "../../shared/i18n";

export function adminWorkflowRoutes(storage: ApplicationStorage): Router {
  const router = Router();
  const errorText = (req: import("express").Request, key: string) =>
    t(resolveLocale(req.get("accept-language")), key);
  const parseWorkflowId = (value: string | string[] | undefined): number =>
    typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;

  router.get("/api/admin/workflows", requireAdmin(storage.credentials), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const page = await storage.workflows.list(limit + 1, beforeId);
    const total = await storage.workflows.count();
    const hasMore = page.length > limit;
    res.json({
      current: await storage.workflows.current(),
      active: await storage.workflows.listActive(),
      runs: page.slice(0, limit),
      beforeId,
      nextCursor:
        page.length > limit ? (page[limit - 1]?.id ?? null) : (page[page.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });

  router.delete("/api/admin/workflows", requireAdmin(storage.credentials), async (req, res) => {
    try {
      const result = await storage.workflows.clearHistory();
      if (result.activeRuns > 0) {
        res.status(409).json({
          error: errorText(req, "serverErrors.activeWorkflowHistory"),
          activeRuns: result.activeRuns,
        });
        return;
      }
      res.json({ ok: true, deletedRuns: result.deletedRuns });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/api/admin/workflows/:id", requireAdmin(storage.credentials), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = parseWorkflowId(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: errorText(req, "serverErrors.invalidWorkflowId") });
      return;
    }
    const run = await storage.workflows.get(id);
    if (!run) {
      res.status(404).json({ error: errorText(req, "serverErrors.workflowNotFound") });
      return;
    }
    res.json({ run, stages: await storage.workflows.stages(id) });
  });

  router.post(
    "/api/admin/workflows/:id/cancel",
    requireAdmin(storage.credentials),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const id = parseWorkflowId(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        res.status(400).json({ error: errorText(req, "serverErrors.invalidWorkflowId") });
        return;
      }
      const result = await storage.workflows.cancelPending(id);
      if (result === "not-found") {
        res.status(404).json({ error: errorText(req, "serverErrors.workflowNotFound") });
        return;
      }
      if (result === "not-pending") {
        res.status(409).json({ error: errorText(req, "serverErrors.workflowCannotCancel") });
        return;
      }
      res.json({ ok: true, id, status: "cancelled" });
    }
  );

  router.delete("/api/admin/workflows/:id", requireAdmin(storage.credentials), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = parseWorkflowId(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: errorText(req, "serverErrors.invalidWorkflowId") });
      return;
    }
    const result = await storage.workflows.delete(id);
    if (result === "not-found") {
      res.status(404).json({ error: errorText(req, "serverErrors.workflowNotFound") });
      return;
    }
    if (result === "active") {
      res.status(409).json({ error: errorText(req, "serverErrors.workflowCannotDelete") });
      return;
    }
    res.json({ ok: true, id });
  });

  return router;
}
