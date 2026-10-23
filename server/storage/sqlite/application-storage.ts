import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import type { AppSettings } from "../../../shared/contracts";
import type {
  AccessEventInput,
  ApplicationStorage,
  GenerationLogRepository,
  MonitoringRepository,
  SettingsRepository,
  WorkflowRepository,
} from "../repositories";
import { appendGenerationLog, countGenerationLogs, recentLogs } from "./generation-logs";
import { getSettings, setSettings, updateSettings } from "./settings";
import { checkpointDatabase, resetOperationalData, vacuumDatabase } from "./maintenance";
import { closeDatabase } from "./database";

import {
  cancelPendingWorkflow,
  clearWorkflowHistory,
  claimWorkflowRun,
  countWorkflowRuns,
  createWorkflowRun,
  deleteWorkflowRun,
  finishWorkflowStage,
  getCurrentWorkflow,
  getWorkflowRun,
  listActiveWorkflowRuns,
  listWorkflowRuns,
  listWorkflowStages,
  markInterruptedWorkflows,
  startWorkflowStage,
  updateWorkflowRun,
} from "./workflows";
import { countAccessEvents, getMonitorSummary, listAccessEvents, recordAccessEvent } from "./monitoring";
import { SqliteAdminCredentialRepository } from "./credentials";
import { createFilesystemArtifactRepository } from "../filesystem/artifact-repository";

export function createSqliteSettingsRepository(database: Database): SettingsRepository {
  return {
    get: () => getSettings(database),
    set: (settings: AppSettings) => setSettings(database, settings),
    update: (patch: Partial<AppSettings>) => updateSettings(database, patch),
  };
}

export function createSqliteGenerationLogRepository(database: Database): GenerationLogRepository {
  return {
    append: (success, mode, resultCode, detail = {}, error = "") =>
      appendGenerationLog(database, success, mode, resultCode, detail, error),
    list: (limit = 20, offset = 0, beforeId = 0) => recentLogs(database, limit, offset, beforeId),
    count: () => countGenerationLogs(database),
    storageBytes: () => {
      const row = database.query("SELECT COALESCE(SUM(length(result_code) + length(detail) + length(error) + length(mode) + 48), 0) AS bytes FROM generation_log").get() as { bytes: number };
      return Number(row.bytes || 0);
    },
    cleanup: (retentionDays = getSettings(database).logRetentionDays) => {
      if (retentionDays <= 0) return 0;
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString().slice(0, 19).replace("T", " ");
      return Number(database.query("DELETE FROM generation_log WHERE created_at < ?").run(cutoff).changes);
    },
    clear: () => Number(database.query("DELETE FROM generation_log").run().changes),
  };
}

export function createSqliteMonitoringRepository(
  database: Database,
): MonitoringRepository {
  return {
    record: (event: AccessEventInput) => recordAccessEvent(database, event),
    list: (limit = 50, beforeId = 0) => listAccessEvents(database, limit, beforeId),
    count: () => countAccessEvents(database),
    storageBytes: () => {
      const row = database.query("SELECT COALESCE(SUM(length(path) + length(category) + length(source_ip) + length(user_agent) + 96), 0) AS bytes FROM access_events").get() as { bytes: number };
      return Number(row.bytes || 0);
    },
    summarize: (activeRequests, tcpConnections) => getMonitorSummary(database, activeRequests, tcpConnections),
    cleanup: (retentionDays = getSettings(database).logRetentionDays) => {
      if (retentionDays <= 0) return 0;
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      return Number(database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoff).changes);
    },
    clear: () => {
      const count = countAccessEvents(database);
      database.query("DELETE FROM access_events").run();
      return count;
    },
  };
}

export function createSqliteWorkflowRepository(database: Database): WorkflowRepository {
  return {
    create: (source, mode) => createWorkflowRun(database, source, mode),
    claim: (id, startedAt) => claimWorkflowRun(database, id, startedAt),
    update: (id, patch) => updateWorkflowRun(database, id, patch),
    list: (limit = 50, beforeId = 0) => listWorkflowRuns(database, limit, beforeId),
    count: () => countWorkflowRuns(database),
    listActive: () => listActiveWorkflowRuns(database),
    current: () => getCurrentWorkflow(database),
    markInterrupted: () => markInterruptedWorkflows(database),
    startStage: (runId, stageKey, detail = "") => startWorkflowStage(database, runId, stageKey, detail),
    finishStage: (stageId, status, error = "", detail = "") =>
      finishWorkflowStage(database, stageId, status, error, detail),
    get: (id) => getWorkflowRun(database, id),
    stages: (runId) => listWorkflowStages(database, runId),
    cancelPending: (id) => cancelPendingWorkflow(database, id),
    clearHistory: () => clearWorkflowHistory(database),
    delete: (id) => deleteWorkflowRun(database, id),
  };
}

/** SQLite composition root. Business layers consume repository ports, not SQL. */
export function createSqliteApplicationStorage(database: Database, dataDir: string): ApplicationStorage {
  if (dataDir === ":memory:") {
    throw new Error('SQLite storage requires a filesystem data directory; use the memory adapter for memory mode.');
  }
  return {
    driver: "sqlite",
    settings: createSqliteSettingsRepository(database),
    credentials: new SqliteAdminCredentialRepository(database),
    generationLogs: createSqliteGenerationLogRepository(database),
    monitoring: createSqliteMonitoringRepository(database),
    workflows: createSqliteWorkflowRepository(database),
    artifacts: createFilesystemArtifactRepository(dataDir),
    maintenance: {
      databaseBytes: () => {
        return ["database.db", "database.db-wal", "database.db-shm"].reduce((sum, name) => {
          try { return sum + fs.statSync(path.join(dataDir, name)).size; } catch { return sum; }
        }, 0);
      },
      compact: () => vacuumDatabase(database, true),
      checkpoint: () => checkpointDatabase(database),
      resetOperationalData: (settings) => { resetOperationalData(database, settings); },
    },
    close: () => closeDatabase(database),
  };
}
