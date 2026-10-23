import type { AppSettings } from "../../../shared/contracts";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import type { ApplicationStorage } from "../repositories";
import { asAsyncRepository } from "../async-repository";
import { MemoryAdminCredentialRepository } from "./admin-credential-repository";
import { createMemoryArtifactRepository } from "./artifact-repository";
import { createMemoryGenerationLogRepository } from "./generation-log-repository";
import { createMemoryMonitoringRepository } from "./monitoring-repository";
import { createMemorySettingsRepository } from "./settings-repository";
import { createMemoryWorkflowRepository } from "./workflow-repository";

export function createMemoryApplicationStorage(): ApplicationStorage {
  const settings = createMemorySettingsRepository();
  const credentials = new MemoryAdminCredentialRepository();
  const artifacts = createMemoryArtifactRepository();
  const generationLogs = createMemoryGenerationLogRepository(() => settings.get().logRetentionDays);
  const monitoring = createMemoryMonitoringRepository(() => settings.get().logRetentionDays);
  const workflows = createMemoryWorkflowRepository();
  let closed = false;

  return {
    driver: "memory",
    settings: asAsyncRepository(settings),
    credentials: asAsyncRepository(credentials),
    generationLogs: asAsyncRepository(generationLogs),
    monitoring: asAsyncRepository(monitoring),
    workflows: asAsyncRepository(workflows),
    artifacts: asAsyncRepository(artifacts),
    maintenance: asAsyncRepository({
      databaseBytes: () => 0,
      compact: () => {},
      checkpoint: () => {},
      resetOperationalData(value: AppSettings) {
        generationLogs.clear();
        monitoring.clear();
        workflows.reset();
        settings.set(value);
      },
    }),
    async close() {
      if (closed) return;
      closed = true;
      settings.set(DEFAULT_SETTINGS);
      credentials.clear();
      artifacts.clear();
      generationLogs.clear();
      monitoring.clear();
      workflows.reset();
    },
  };
}
