import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import { getWorkflowRun } from "../db/sqlite";
import { requireAdmin } from "../middleware/auth";
import { probeGenpac } from "../services/pac-generator";
import { startPacWorkflow } from "../services/workflow";
import { adminWorkflowRoutes } from "./admin-workflows";
import { adminMonitorRoutes } from "./admin-monitor";
import { adminSystemRoutes } from "./admin-system";
import { adminAuthRoutes } from "./admin-auth";
import { adminSettingsRoutes } from "./admin-settings";

export function adminRoutes(env: EnvConfig, database: AppDatabase): Router {
  const router = Router();
  router.use(adminWorkflowRoutes(database));
  router.use(adminMonitorRoutes(database));
  router.use(adminSystemRoutes(env, database));
  router.use(adminAuthRoutes(database));
  router.use(adminSettingsRoutes(env, database));
  router.post("/api/admin/generate", requireAdmin(database), (_req, res) => {
    try {
      const workflowId = startPacWorkflow(database, env.dataDir, "manual");
      res
        .status(202)
        .json({ workflowId, status: getWorkflowRun(database, workflowId)?.status ?? "pending" });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/genpac-status", requireAdmin(database), async (_req, res) =>
    res.json(await probeGenpac())
  );
  return router;
}
