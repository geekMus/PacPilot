import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import type { AppSettings } from "../../shared/contracts";
import type {
  AccessEventInput,
  ApplicationStorage,
  ArtifactRepository,
  GenerationLogRepository,
  MonitoringRepository,
  SettingsRepository,
  WorkflowRepository,
} from "./repositories";
import {
  appendGenerationLog,
  clearOperationalLogs,
  cleanupOperationalLogs,
  checkpointDatabase,
  countAccessEvents,
  countGenerationLogs,
  countWorkflowRuns,
  getSettings,
  recentLogs,
  resetOperationalData,
  vacuumDatabase,
  setSettings,
  updateSettings,
} from "../db/sqlite";
import {
  cancelPendingWorkflow,
  clearWorkflowHistory,
  claimWorkflowRun,
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
} from "../db/workflows";
import { getMonitorSummary, listAccessEvents, recordAccessEvent } from "../db/monitoring";
import { SqliteAdminCredentialRepository } from "./sqlite-credentials";
import { isMemoryPath, readEphemeralFile, statEphemeralFile, unlinkEphemeralFile, writeEphemeralFile } from "./ephemeral-files";

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
    create: (source, mode) => createWorkflowRun(database as never, source, mode),
    claim: (id, startedAt) => claimWorkflowRun(database as never, id, startedAt),
    update: (id, patch) => updateWorkflowRun(database as never, id, patch),
    list: (limit = 50, beforeId = 0) => listWorkflowRuns(database as never, limit, beforeId),
    count: () => countWorkflowRuns(database),
    listActive: () => listActiveWorkflowRuns(database as never),
    current: () => getCurrentWorkflow(database as never),
    markInterrupted: () => markInterruptedWorkflows(database as never),
    startStage: (runId, stageKey, detail = "") => startWorkflowStage(database as never, runId, stageKey, detail),
    finishStage: (stageId, status, error = "", detail = "") =>
      finishWorkflowStage(database as never, stageId, status, error, detail),
    get: (id) => getWorkflowRun(database as never, id),
    stages: (runId) => listWorkflowStages(database as never, runId),
    cancelPending: (id) => cancelPendingWorkflow(database as never, id),
    clearHistory: () => clearWorkflowHistory(database as never),
    delete: (id) => deleteWorkflowRun(database as never, id),
  };
}

export function createSqliteArtifactRepository(dataDir: string): ArtifactRepository {
  const filePath = (key: string) => {
    let normalized = key.split("\\\\").join("/");
    while (normalized.startsWith("/")) normalized = normalized.slice(1);
    if (!normalized || normalized.split("/").some((part) => part === "." || part === "..")) {
      throw new Error("Artifact key must be a safe relative path.");
    }
    return path.join(dataDir, normalized);
  };
  return {
    read(key) {
      const target = filePath(key);
      try {
        return new TextEncoder().encode(isMemoryPath(dataDir) ? readEphemeralFile(target) : fs.readFileSync(target, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    write(key, contents) {
      const target = filePath(key);
      const text = typeof contents === "string" ? contents : new TextDecoder().decode(contents);
      if (isMemoryPath(dataDir)) {
        writeEphemeralFile(target, text);
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text, "utf8");
      }
    },
    delete(key) {
      const target = filePath(key);
      try {
        if (isMemoryPath(dataDir)) unlinkEphemeralFile(target);
        else fs.unlinkSync(target);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    exists(key) {
      try {
        if (isMemoryPath(dataDir)) { statEphemeralFile(filePath(key)); return true; }
        return fs.statSync(filePath(key)).isFile();
      } catch { return false; }
    },
    list(prefix = "") {
      if (isMemoryPath(dataDir)) return [];
      const root = prefix ? filePath(prefix) : dataDir;
      try {
        return fs.readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => prefix ? (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix) + "/" + entry.name : entry.name)
          .sort();
      } catch { return []; }
    },
  };
}

/** SQLite composition root. Business layers consume repository ports, not SQL. */
export function createSqliteApplicationStorage(database: Database, dataDir: string): ApplicationStorage {
  return {
    driver: "sqlite",
    settings: createSqliteSettingsRepository(database),
    credentials: new SqliteAdminCredentialRepository(database),
    generationLogs: createSqliteGenerationLogRepository(database),
    monitoring: createSqliteMonitoringRepository(database),
    workflows: createSqliteWorkflowRepository(database),
    artifacts: createSqliteArtifactRepository(dataDir),
    maintenance: {
      databaseBytes: () => {
        if (dataDir === ":memory:") return 0;
        return ["database.db", "database.db-wal", "database.db-shm"].reduce((sum, name) => {
          try { return sum + fs.statSync(path.join(dataDir, name)).size; } catch { return sum; }
        }, 0);
      },
      compact: () => vacuumDatabase(database, true),
      checkpoint: () => checkpointDatabase(database),
      resetOperationalData: (settings) => { resetOperationalData(database, settings); },
    },
    close: () => database.close(),
  };
}
