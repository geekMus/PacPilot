import { Router } from "express";
import type { ApplicationStorage } from "../storage/repositories";
import { requireAdmin } from "../middleware/auth";
import { probePacPilot } from "../services/pac-generator";
import { startPacWorkflow } from "../services/workflow";
import { resolveLocale } from "../../shared/i18n";

function requestLocale(req: import("express").Request): "zh_CN" | "en_US" {
  return resolveLocale(req.get("accept-language"));
}

export function adminGenerationRoutes(dataDir: string, storage: ApplicationStorage): Router {
  const router = Router();
  router.post("/api/admin/generate", requireAdmin(storage.credentials), async (req, res) => {
    try {
      const workflowId = await startPacWorkflow(storage, dataDir, "manual", requestLocale(req));
      res.status(202).json({
        workflowId,
        status: (await storage.workflows.get(workflowId))?.status ?? "pending",
      });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/pacpilot-status", requireAdmin(storage.credentials), async (req, res) =>
    res.json(await probePacPilot(requestLocale(req)))
  );
  return router;
}
