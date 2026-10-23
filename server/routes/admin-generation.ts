import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { ApplicationStorage } from "../storage/repositories";
import { getWorkflowRun } from "../db/sqlite";
import { requireAdmin } from "../middleware/auth";
import { probePacPilot } from "../services/pac-generator";
import { startPacWorkflow } from "../services/workflow";

export function adminGenerationRoutes(database: AppDatabase, dataDir: string, storage: ApplicationStorage): Router {
  const router = Router();
  router.post("/api/admin/generate", requireAdmin(database), (_req, res) => {
    try {
      const workflowId = startPacWorkflow(storage, dataDir, "manual");
      res
        .status(202)
        .json({ workflowId, status: getWorkflowRun(database, workflowId)?.status ?? "pending" });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/pacpilot-status", requireAdmin(database), async (_req, res) =>
    res.json(await probePacPilot())
  );
  return router;
}
