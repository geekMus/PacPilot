import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import {
  cleanupOperationalLogs,
  checkpointDatabase,
  countGenerationLogs,
  getOperationalCounts,
  clearOperationalLogs,
  getSettings,
  operationalLogStorageBytes,
  recentLogs,
  resetOperationalData,
  setSettings,
  vacuumDatabase,
} from "../db/sqlite";
import { DEFAULT_SETTINGS } from "../db/settings";
import { requireAdmin } from "../middleware/auth";
import { hasActivePacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { resolveLocale, t as serverT } from "../../shared/i18n";
import { isMemoryPath, statEphemeralFile, unlinkEphemeralFile } from "../storage/ephemeral-files";

function requestLocale(req: import("express").Request): "zh_CN" | "en_US" {
  return resolveLocale(req.get("accept-language"));
}

export function adminSystemRoutes(env: EnvConfig, database: AppDatabase): Router {
  const router = Router();
  router.get("/api/admin/storage", requireAdmin(database), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    let dataBytes = 0;
    const walk = (dir: string): void => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) dataBytes += fs.statSync(full).size;
        }
      } catch {
        /* missing or inaccessible data directory */
      }
    };
    if (env.storageDriver === "sqlite") walk(env.dataDir);
    else {
      for (const name of ["proxy.pac", "proxy.source.pac"]) {
        try { dataBytes += statEphemeralFile(path.join(env.dataDir, name)).size; } catch { /* absent */ }
      }
    }
    const dbBytes = env.storageDriver === "memory" ? 0 : ["database.db", "database.db-wal", "database.db-shm"].reduce((sum, name) => {
      try {
        return sum + fs.statSync(path.join(env.dataDir, name)).size;
      } catch {
        return sum;
      }
    }, 0);
    const counts = getOperationalCounts(database);
    const pacFileInfo = (name: string) => {
      try {
        const filePath = path.join(env.dataDir, name);
      const stat = isMemoryPath(env.dataDir) ? statEphemeralFile(filePath) : fs.statSync(filePath);
        if (!stat.isFile()) return { exists: false, sizeBytes: 0, modifiedAt: null };
        return { exists: true, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
      } catch {
        return { exists: false, sizeBytes: 0, modifiedAt: null };
      }
    };
    res.json({
      dataBytes,
      dbBytes,
      logBytes: operationalLogStorageBytes(database),
      retentionDays: getSettings(database).logRetentionDays,
      counts,
      pacFiles: {
        proxyPac: pacFileInfo("proxy.pac"),
        proxySourcePac: pacFileInfo("proxy.source.pac"),
      },
    });
  });
  router.delete("/api/admin/pac-files", requireAdmin(database), (req, res) => {
    if (hasActivePacWorkflow(database)) {
      res.status(409).json({
        error: serverT(requestLocale(req), "serverErrors.activeWorkflowPacDelete"),
      });
      return;
    }
    const deleted: string[] = [];
    try {
      for (const name of ["proxy.pac", "proxy.source.pac"]) {
        try {
          if (isMemoryPath(env.dataDir)) unlinkEphemeralFile(path.join(env.dataDir, name));
          else fs.unlinkSync(path.join(env.dataDir, name));
          deleted.push(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const fileInfo = (name: string) => {
        try {
          const filePath = path.join(env.dataDir, name);
          const stat = isMemoryPath(env.dataDir) ? statEphemeralFile(filePath) : fs.statSync(filePath);
          return {
            exists: stat.isFile(),
            sizeBytes: stat.isFile() ? stat.size : 0,
            modifiedAt: stat.isFile() ? stat.mtime.toISOString() : null,
          };
        } catch {
          return { exists: false, sizeBytes: 0, modifiedAt: null };
        }
      };
      res.json({
        ok: true,
        deleted,
        pacFiles: { proxyPac: fileInfo("proxy.pac"), proxySourcePac: fileInfo("proxy.source.pac") },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/api/admin/logs/cleanup", requireAdmin(database), (_req, res) => {
    const deleted = cleanupOperationalLogs(database);
    if (deleted.generationLogs + deleted.accessEvents > 0) {
      if (env.storageDriver === "sqlite") vacuumDatabase(database, true);
    }
    res.json({ deleted, retentionDays: getSettings(database).logRetentionDays });
  });
  router.post("/api/admin/logs/clear", requireAdmin(database), (_req, res) => {
    try {
      const deleted = clearOperationalLogs(database);
      if (env.storageDriver === "sqlite") database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
      res.json({ deleted, retentionDays: getSettings(database).logRetentionDays });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/api/admin/factory-reset", requireAdmin(database), (req, res) => {
    if (req.body?.confirm !== "RESET") {
      res.status(400).json({
        error: serverT(requestLocale(req), "serverErrors.invalidFactoryResetConfirmation"),
      });
      return;
    }
    if (hasActivePacWorkflow(database)) {
      res.status(409).json({
        error: serverT(requestLocale(req), "serverErrors.activeWorkflowFactoryReset"),
      });
      return;
    }
    try {
      resetOperationalData(database, DEFAULT_SETTINGS);
      if (env.storageDriver === "sqlite") vacuumDatabase(database, true);
      for (const name of ["proxy.pac", "proxy.source.pac"]) {
        try {
          if (isMemoryPath(env.dataDir)) unlinkEphemeralFile(path.join(env.dataDir, name));
          else fs.unlinkSync(path.join(env.dataDir, name));
        } catch {
          /* already absent */
        }
      }
      reschedule(database, env.dataDir);
      res.json({
        ok: true,
        message: serverT(requestLocale(req), "serverErrors.factoryResetCompleted"),
      });
    } catch (e) {
      try {
        database.run("ROLLBACK");
      } catch {
        /* transaction already closed */
      }
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/logs", requireAdmin(database), (_req, res) => {
    res.json(recentLogs(database, 50));
  });
  router.get("/api/admin/logs/page", requireAdmin(database), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const rows = recentLogs(database, limit + 1, 0, beforeId);
    const total = countGenerationLogs(database);
    const hasMore = rows.length > limit;
    res.json({
      items: rows.slice(0, limit),
      nextCursor:
        rows.length > limit ? (rows[limit - 1]?.id ?? null) : (rows[rows.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });
  return router;
}
