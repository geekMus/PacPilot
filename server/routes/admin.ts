import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import { adminWorkflowRoutes } from "./admin-workflows";
import { adminMonitorRoutes } from "./admin-monitor";
import { adminSystemRoutes } from "./admin-system";
import { adminAuthRoutes } from "./admin-auth";
import { adminSettingsRoutes } from "./admin-settings";
import { adminGenerationRoutes } from "./admin-generation";

export function adminRoutes(env: EnvConfig, database: AppDatabase): Router {
  const router = Router();
  router.use(adminWorkflowRoutes(database));
  router.use(adminMonitorRoutes(database));
  router.use(adminSystemRoutes(env, database));
  router.use(adminAuthRoutes(database));
  router.use(adminSettingsRoutes(env, database));
  router.use(adminGenerationRoutes(database, env.dataDir));
  return router;
}
