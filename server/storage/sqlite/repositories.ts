import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite";
import type { AppSettings } from "../../../shared/contracts";
import type {
  AccessEventInput,
  ApplicationStorage,
  ArtifactRepository,
  GenerationLogRepository,
  MonitoringRepository,
  SettingsRepository,
  WorkflowRepository,
} from "../repositories";
import {
  appendGenerationLog,
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
} from "./sqlite";
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
} from "./workflows";
import { getMonitorSummary, listAccessEvents, recordAccessEvent } from "./monitoring";
import { SqliteAdminCredentialRepository } from "./credentials";

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
    let normalized = key.split(String.fromCharCode(92)).join("/");
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
        return new TextEncoder().encode(fs.readFileSync(target, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    write(key, contents) {
      const target = filePath(key);
      const text = typeof contents === "string" ? contents : new TextDecoder().decode(contents);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, "utf8");
    },
    delete(key) {
      const target = filePath(key);
      try {
        fs.unlinkSync(target);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    exists(key) {
      try {
        return fs.statSync(filePath(key)).isFile();
      } catch { return false; }
    },
    stat(key) {
      try {
        const stat = fs.statSync(filePath(key));
        return stat.isFile() ? { size: stat.size, modifiedAt: stat.mtime.toISOString() } : undefined;
      } catch { return undefined; }
    },
    list(prefix = "") {
      const result: string[] = [];
      const walk = (dir: string, relative: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const nextRelative = relative ? relative + "/" + entry.name : entry.name;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full, nextRelative);
            else if (entry.isFile() && nextRelative.startsWith(prefix)) result.push(nextRelative);
          }
        } catch { /* missing or inaccessible directory */ }
      };
      walk(dataDir, "");
      return result.sort();
    },
    totalBytes() {
      let bytes = 0;
      const walk = (dir: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) bytes += fs.statSync(full).size;
          }
        } catch { /* missing or inaccessible directory */ }
      };
      walk(dataDir);
      return bytes;
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
