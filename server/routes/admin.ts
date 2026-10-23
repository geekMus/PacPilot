import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { ApplicationStorage } from "../storage/repositories";
import type { EnvConfig } from "../config/env";
import { adminWorkflowRoutes } from "./admin-workflows";
import { adminMonitorRoutes } from "./admin-monitor";
import { adminSystemRoutes } from "./admin-system";
import { adminAuthRoutes } from "./admin-auth";
import { adminSettingsRoutes } from "./admin-settings";
import { adminGenerationRoutes } from "./admin-generation";

export function adminRoutes(env: EnvConfig, database: AppDatabase, storage: ApplicationStorage): Router {
  const router = Router();
  router.use(adminWorkflowRoutes(database, storage));
  router.use(adminMonitorRoutes(database));
  router.use(adminSystemRoutes(env, database, storage));
  router.use(adminAuthRoutes(database));
  router.use(adminSettingsRoutes(env, database, storage));
  router.use(adminGenerationRoutes(database, env.dataDir, storage));
  return router;
}
