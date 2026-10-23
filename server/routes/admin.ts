import { Router } from "express";
import type { ApplicationStorage } from "../storage/repositories";
import type { EnvConfig } from "../config/env";
import { adminWorkflowRoutes } from "./admin-workflows";
import { adminMonitorRoutes } from "./admin-monitor";
import { adminSystemRoutes } from "./admin-system";
import { adminAuthRoutes } from "./admin-auth";
import { adminSettingsRoutes } from "./admin-settings";
import { adminGenerationRoutes } from "./admin-generation";
import { adminNotificationRoutes } from "./admin-notifications";
import { adminNotificationRoutes } from "./admin-notifications";

export function adminRoutes(env: EnvConfig, storage: ApplicationStorage): Router {
  const router = Router();
  router.use(adminWorkflowRoutes(storage));
  router.use(adminNotificationRoutes(storage));
  router.use(adminNotificationRoutes(storage));
  router.use(adminMonitorRoutes(storage));
  router.use(adminSystemRoutes(env, storage));
  router.use(adminAuthRoutes(storage));
  router.use(adminSettingsRoutes(env, storage));
  router.use(adminGenerationRoutes(env.dataDir, storage));
  return router;
}
