import { Router } from "express";
import type { EnvConfig } from "../config/env";
import type { ApplicationStorage } from "../storage/repositories";

import { DEFAULT_SETTINGS } from "../domain/settings";
import { requireAdmin } from "../middleware/auth";
import { readProcessMemorySnapshot } from "../utils/process-memory";
import { hasActivePacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import {
  getRenderedPac,
  readRuleSource,
  invalidateRenderedPac,
  clearRuleSource,
} from "../services/pac-runtime";
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
      accessEvents: await storage.monitoring.count(),
      workflows: await storage.workflows.count(),
    };
    // The PAC body is rendered in memory now; report that instead of files.
    const rendered = getRenderedPac();
    const ruleSource = await readRuleSource(storage);
    const settings = await storage.settings.get();
    res.json({
      dataBytes,
      dbBytes,
      logBytes: await storage.monitoring.storageBytes(),
      counts,
      pac: {
        rendered: rendered
          ? {
              exists: true,
              sizeBytes: Buffer.byteLength(rendered.body, "utf8"),
              sourceBytes: Buffer.byteLength(rendered.source, "utf8"),
              builtAt: rendered.builtAt,
              etag: rendered.etag,
              compressed: Boolean(settings.pacCompress || settings.pacObfuscate),
              obfuscated: rendered.obfuscated,
            }
          : {
              exists: false,
              sizeBytes: 0,
              sourceBytes: 0,
              builtAt: null,
              etag: "",
              compressed: false,
              obfuscated: false,
            },
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
    });
  });
  // Memory is polled more often than the storage summary, so it lives on its
  // own cheap endpoint instead of inflating the (recursive) storage scan.
  router.get("/api/admin/memory", requireAdmin(storage.credentials), (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(readProcessMemorySnapshot());
  });
  router.delete("/api/admin/pac-cache", requireAdmin(storage.credentials), async (req, res) => {
    if (await hasActivePacWorkflow(storage)) {
      res.status(409).json({
        error: serverT(requestLocale(req), "serverErrors.activeWorkflowPacDelete"),
      });
      return;
    }
    const deleted: string[] = [];
    try {
      // The PAC body is rendered in memory, so clearing means dropping the
      // persisted remote rule snapshot and the in-memory render; the next
      // request rebuilds from the current settings.
      if (await storage.artifacts.exists("pac.rule-source.json")) {
        await clearRuleSource(storage);
        deleted.push("pac.rule-source.json");
      }
      invalidateRenderedPac();
      deleted.push("rendered");
      // The caller refreshes the full storage summary afterwards, so there is no
      // need to echo the resulting PAC state back here.
      res.json({ ok: true, deleted });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  router.post("/api/admin/logs/cleanup", requireAdmin(storage.credentials), async (_req, res) => {
    const retentionDays = (await storage.settings.get()).logRetentionDays;
    const deleted = {
      accessEvents: await storage.monitoring.cleanup(retentionDays),
      workflowRuns: await storage.workflows.cleanup(retentionDays),
    };
    if (deleted.accessEvents > 0 || deleted.workflowRuns > 0) {
      if (env.storageDriver === "sqlite") await storage.maintenance.compact();
    }
    res.json({ deleted });
  });
  router.post("/api/admin/logs/clear", requireAdmin(storage.credentials), async (_req, res) => {
    try {
      const deleted = {
        accessEvents: await storage.monitoring.clear(),
        workflowRuns: await storage.workflows.clear(),
      };
      if (env.storageDriver === "sqlite") await storage.maintenance.compact();
      res.json({ deleted });
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
      // Settings fall back to custom mode, so the remote rule snapshot and the
      // in-memory render built from the previous settings are no longer valid.
      await clearRuleSource(storage);
      invalidateRenderedPac();
      reschedule(storage, env.dataDir);
      res.json({
        ok: true,
        message: serverT(requestLocale(req), "serverErrors.factoryResetCompleted"),
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  return router;
}
