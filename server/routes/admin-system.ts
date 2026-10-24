import { Router } from "express";
import type { EnvConfig } from "../config/env";
import type { ApplicationStorage } from "../storage/repositories";

import { DEFAULT_SETTINGS } from "../domain/settings";
import { requireAdmin } from "../middleware/auth";
import { hasActivePacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { getRenderedPac } from "../services/pac-runtime";
import { readRuleSource, invalidateRenderedPac, clearRuleSource } from "../services/pac-runtime";
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
    // The PAC body is rendered in memory now; report that instead of files.
    const rendered = getRenderedPac();
    const ruleSource = await readRuleSource(storage);
    res.json({
      dataBytes,
      dbBytes,
      logBytes:
        (await storage.generationLogs.storageBytes()) + (await storage.monitoring.storageBytes()),
      retentionDays: (await storage.settings.get()).logRetentionDays,
      counts,
      pac: {
        rendered: rendered
          ? {
              exists: true,
              sizeBytes: Buffer.byteLength(rendered.body, "utf8"),
              sourceBytes: Buffer.byteLength(rendered.source, "utf8"),
              builtAt: rendered.builtAt,
              etag: rendered.etag,
              compressed: (await storage.settings.get()).pacCompress,
            }
          : { exists: false, sizeBytes: 0, sourceBytes: 0, builtAt: null, etag: "", compressed: false },
        ruleSource: ruleSource
          ? {
              exists: true,
              fetchedAt: ruleSource.fetchedAt,
              url: ruleSource.url,
              format: ruleSource.format,
              proxyHosts: ruleSource.proxyHosts.length,
              directHosts: ruleSource.directHosts.length,
            }
          : { exists: false, fetchedAt: null, url: "", format: "", proxyHosts: 0, directHosts: 0 },
      },
      // Retained for older clients; both entries describe the in-memory render.
      pacFiles: {
        proxyPac: rendered
          ? {
              exists: true,
              sizeBytes: Buffer.byteLength(rendered.body, "utf8"),
              modifiedAt: rendered.builtAt,
            }
          : { exists: false, sizeBytes: 0, modifiedAt: null },
        proxySourcePac: ruleSource
          ? {
              exists: true,
              sizeBytes: Buffer.byteLength(JSON.stringify(ruleSource), "utf8"),
              modifiedAt: ruleSource.fetchedAt,
            }
          : { exists: false, sizeBytes: 0, modifiedAt: null },
      },
      legacyPacFiles: {
        proxyPac: await pacFileInfo("proxy.pac"),
        proxySourcePac: await pacFileInfo("proxy.source.pac"),
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
      // The PAC body is no longer stored on disk. Clearing means dropping the
      // persisted remote rule snapshot and the in-memory render, so the next
      // request rebuilds from the current settings.
      if (await storage.artifacts.exists("pac.rule-source.json")) {
        await clearRuleSource(storage);
        deleted.push("pac.rule-source.json");
      }
      invalidateRenderedPac();
      deleted.push("rendered");
      if (await storage.artifacts.delete("proxy.pac")) deleted.push("proxy.pac");
      if (await storage.artifacts.delete("proxy.source.pac")) deleted.push("proxy.source.pac");
      const rendered = getRenderedPac();
      const ruleSource = await readRuleSource(storage);
      res.json({
        ok: true,
        deleted,
        pac: {
          rendered: rendered ? { exists: true, builtAt: rendered.builtAt } : { exists: false, builtAt: null },
          ruleSource: ruleSource ? { exists: true, fetchedAt: ruleSource.fetchedAt } : { exists: false, fetchedAt: null },
        },
        pacFiles: {
          proxyPac: rendered
            ? {
                exists: true,
                sizeBytes: Buffer.byteLength(rendered.body, "utf8"),
                modifiedAt: rendered.builtAt,
              }
            : { exists: false, sizeBytes: 0, modifiedAt: null },
          proxySourcePac: ruleSource
            ? { exists: true, sizeBytes: 0, modifiedAt: ruleSource.fetchedAt }
            : { exists: false, sizeBytes: 0, modifiedAt: null },
        },
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
