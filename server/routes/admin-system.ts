import { Router } from "express";
import type { EnvConfig } from "../config/env";
import type { ApplicationStorage } from "../storage/repositories";

import { DEFAULT_SETTINGS } from "../domain/settings";
import { requireAdmin } from "../middleware/auth";
import { hasActivePacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { resolveLocale, t as serverT } from "../../shared/i18n";

function requestLocale(req: import("express").Request): "zh_CN" | "en_US" {
  return resolveLocale(req.get("accept-language"));
}

export function adminSystemRoutes(env: EnvConfig, storage: ApplicationStorage): Router {
  const router = Router();
  router.get("/api/admin/storage", requireAdmin(storage.credentials), async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const dataBytes = await storage.artifacts.totalBytes();
    const dbBytes = await storage.maintenance.databaseBytes();
    const counts = {
      generationLogs: await storage.generationLogs.count(),
      accessEvents: await storage.monitoring.count(),
      workflows: await storage.workflows.count(),
      activeWorkflows: (await storage.workflows.listActive()).length,
    };
    const pacFileInfo = async (name: string) => {
      const stat = await storage.artifacts.stat(name);
      return stat
        ? { exists: true, sizeBytes: stat.size, modifiedAt: stat.modifiedAt }
        : { exists: false, sizeBytes: 0, modifiedAt: null };
    };
    res.json({
      dataBytes,
      dbBytes,
      logBytes:
        (await storage.generationLogs.storageBytes()) + (await storage.monitoring.storageBytes()),
      retentionDays: (await storage.settings.get()).logRetentionDays,
      counts,
      pacFiles: {
        proxyPac: pacFileInfo("proxy.pac"),
        proxySourcePac: pacFileInfo("proxy.source.pac"),
      },
    });
  });
  router.delete("/api/admin/pac-files", requireAdmin(storage.credentials), async (req, res) => {
    if (await hasActivePacWorkflow(storage)) {
      res.status(409).json({
        error: serverT(requestLocale(req), "serverErrors.activeWorkflowPacDelete"),
      });
      return;
    }
    const deleted: string[] = [];
    try {
      for (const name of ["proxy.pac", "proxy.source.pac"]) {
        if (await storage.artifacts.delete(name)) deleted.push(name);
      }
      const fileInfo = async (name: string) => {
        const stat = await storage.artifacts.stat(name);
        return stat
          ? { exists: true, sizeBytes: stat.size, modifiedAt: stat.modifiedAt }
          : { exists: false, sizeBytes: 0, modifiedAt: null };
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
  router.post("/api/admin/logs/cleanup", requireAdmin(storage.credentials), async (_req, res) => {
    const retentionDays = (await storage.settings.get()).logRetentionDays;
    const deleted = {
      generationLogs: await storage.generationLogs.cleanup(retentionDays),
      accessEvents: await storage.monitoring.cleanup(retentionDays),
    };
    if (deleted.generationLogs + deleted.accessEvents > 0) {
      if (env.storageDriver === "sqlite") await storage.maintenance.compact();
    }
    res.json({ deleted, retentionDays: (await storage.settings.get()).logRetentionDays });
  });
  router.post("/api/admin/logs/clear", requireAdmin(storage.credentials), async (_req, res) => {
    try {
      const deleted = {
        generationLogs: await storage.generationLogs.clear(),
        accessEvents: await storage.monitoring.clear(),
      };
      if (env.storageDriver === "sqlite") await storage.maintenance.compact();
      res.json({ deleted, retentionDays: (await storage.settings.get()).logRetentionDays });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/api/admin/factory-reset", requireAdmin(storage.credentials), async (req, res) => {
    if (req.body?.confirm !== "RESET") {
      res.status(400).json({
        error: serverT(requestLocale(req), "serverErrors.invalidFactoryResetConfirmation"),
      });
      return;
    }
    if (await hasActivePacWorkflow(storage)) {
      res.status(409).json({
        error: serverT(requestLocale(req), "serverErrors.activeWorkflowFactoryReset"),
      });
      return;
    }
    try {
      await storage.maintenance.resetOperationalData(DEFAULT_SETTINGS);
      if (env.storageDriver === "sqlite") await storage.maintenance.compact();
      for (const name of ["proxy.pac", "proxy.source.pac"]) await storage.artifacts.delete(name);
      reschedule(storage, env.dataDir);
      res.json({
        ok: true,
        message: serverT(requestLocale(req), "serverErrors.factoryResetCompleted"),
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/logs", requireAdmin(storage.credentials), async (_req, res) => {
    res.json(await storage.generationLogs.list(50));
  });
  router.get("/api/admin/logs/page", requireAdmin(storage.credentials), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const beforeId = Math.max(0, Number.parseInt(String(req.query.beforeId ?? "0"), 10) || 0);
    const rows = await storage.generationLogs.list(limit + 1, 0, beforeId);
    const total = await storage.generationLogs.count();
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
