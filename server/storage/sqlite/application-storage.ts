import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import type { AppSettings } from "../../../shared/contracts";
import type { ApplicationStorage } from "../repositories";
import { asAsyncRepository } from "../async-repository";
import { closeDatabase } from "./database";
import { checkpointDatabase, resetOperationalData, vacuumDatabase } from "./maintenance";
import { SqliteAdminCredentialRepository } from "./credentials";
import { createFilesystemArtifactRepository } from "../filesystem/artifact-repository";
import { createSqliteSettingsRepository } from "./settings-repository";
import { createSqliteGenerationLogRepository } from "./generation-log-repository";
import { createSqliteMonitoringRepository } from "./monitoring-repository";
import { createSqliteWorkflowRepository } from "./workflow-repository";
import { createSqliteNotificationRepository } from "./notification-repository";

/** SQLite composition root. Business layers consume repository ports, not SQL. */
export function createSqliteApplicationStorage(
  database: Database,
  dataDir: string
): ApplicationStorage {
  if (dataDir === ":memory:") {
    throw new Error(
      "SQLite storage requires a filesystem data directory; use the memory adapter for memory mode."
    );
  }
  return {
    driver: "sqlite",
    settings: asAsyncRepository(createSqliteSettingsRepository(database)),
    credentials: asAsyncRepository(new SqliteAdminCredentialRepository(database)),
    generationLogs: asAsyncRepository(createSqliteGenerationLogRepository(database)),
    monitoring: asAsyncRepository(createSqliteMonitoringRepository(database)),
    workflows: asAsyncRepository(createSqliteWorkflowRepository(database)),
    notifications: asAsyncRepository(createSqliteNotificationRepository(database)),
    artifacts: asAsyncRepository(createFilesystemArtifactRepository(dataDir)),
    maintenance: asAsyncRepository({
      databaseBytes: () =>
        ["database.db", "database.db-wal", "database.db-shm"].reduce((sum, name) => {
          try {
            return sum + fs.statSync(path.join(dataDir, name)).size;
          } catch {
            return sum;
          }
        }, 0),
      compact: () => vacuumDatabase(database, true),
      checkpoint: () => checkpointDatabase(database),
      resetOperationalData: (settings: AppSettings) => {
        resetOperationalData(database, settings);
      },
    }),
    async close() {
      closeDatabase(database);
    },
  };
}
