import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import {
  cleanupOperationalLogs,
  clearOperationalLogs,
  getSettings,
  operationalLogStorageBytes,
  recentLogs,
  setSettings,
  updateSettings,
  getWorkflowRun,
} from "../db/sqlite";
import type { AppSettings, GenerationMode } from "../db/settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "../db/settings";
import {
  assertSameOrigin,
  checkLoginRateLimit,
  clearLoginFailures,
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  recordLoginFailure,
  requireAdmin,
  setSessionCookie,
} from "../middleware/auth";
import {
  changeAdminPassword,
  getAdminSessionSecret,
  isAdminCredentialsMissing,
  verifyAdminPassword,
} from "../services/admin-credentials";
import { probeGenpac, validatePacProxyString } from "../services/pac-generator";
import { hasActivePacWorkflow, startPacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { sendWebhookTest, validateWebhookConfig } from "../services/webhook";
import cron from "node-cron";
import { parseProxyTestUrl, ProxyProbeError } from "../services/proxy-probe";
import { resolveLocale, t as serverT } from "../../shared/i18n";
import { assertSafeHttpUrl } from "../utils/url-safety";
import { adminWorkflowRoutes } from "./admin-workflows";
import { adminMonitorRoutes } from "./admin-monitor";

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function validTimeZone(v: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
function bodyToSettings(
  b: Record<string, unknown>,
  fallbackProxyTestUrl = DEFAULT_SETTINGS.proxyTestUrl
): AppSettings {
  const m = String(b.mode ?? "");
  const mode: GenerationMode = m === "remote" ? "remote" : "custom";
  return {
    mode,
    pacProxy: String(b.pacProxy ?? ""),
    pacCompress: Boolean(b.pacCompress),
    listUrl: String(b.listUrl ?? ""),
    blockList: parseList(b.blockList),
    directList: parseList(b.directList),
    cronSchedule: String(b.cronSchedule ?? ""),
    timezone: String(b.timezone ?? "Asia/Shanghai").trim(),
    proxyTestUrl: String(b.proxyTestUrl ?? fallbackProxyTestUrl).trim(),
    logRetentionDays: Math.max(
      0,
      Math.min(
        3650,
        Math.floor(Number(b.logRetentionDays ?? DEFAULT_SETTINGS.logRetentionDays) || 0)
      )
    ),
    webhookSuccessConfig: normalizeWebhookConfig(b.webhookSuccessConfig),
    webhookFailureConfig: normalizeWebhookConfig(b.webhookFailureConfig),
  };
}
function requestLocale(req: import("express").Request): "zh_CN" | "en_US" {
  return resolveLocale(req.get("accept-language"));
}
function persistSettings(
  body: Record<string, unknown>,
  env: EnvConfig,
  database: AppDatabase,
  locale: "zh_CN" | "en_US"
): { settings: AppSettings } | { error: string } {
  const p = bodyToSettings(body, getSettings(database).proxyTestUrl);
  if (p.mode === "remote") {
    const listUrlError = assertSafeHttpUrl(p.listUrl, "rule list URL");
    if (listUrlError) return { error: listUrlError };
  }
  if (!p.timezone || !validTimeZone(p.timezone))
    return {
      error: serverT(locale, "serverErrors.invalidTimezone"),
    };
  try {
    p.proxyTestUrl = parseProxyTestUrl(p.proxyTestUrl).toString();
  } catch (e) {
    return {
      error:
        e instanceof ProxyProbeError
          ? serverT(locale, e.code, { detail: e.detail })
          : e instanceof Error
            ? e.message
            : serverT(locale, "serverErrors.invalidProxyTestUrl"),
    };
  }
  const proxyError = validatePacProxyString(p.pacProxy);
  if (proxyError) return { error: proxyError };
  const expr = p.cronSchedule.trim();
  if (expr && (expr.split(/\s+/).length !== 5 || !cron.validate(expr)))
    return { error: serverT(locale, "serverErrors.invalidCron") };
  for (const c of [p.webhookSuccessConfig, p.webhookFailureConfig]) {
    if (c.url.trim()) {
      const errors = validateWebhookConfig(c);
      if (errors.length) return { error: errors.join("\n") };
    }
  }
  const settings = updateSettings(database, p);
  reschedule(database, env.dataDir);
  return { settings };
}
export function adminRoutes(env: EnvConfig, database: AppDatabase): Router {
  const router = Router();
  router.use(adminWorkflowRoutes(database));
  router.use(adminMonitorRoutes(database));
  router.get("/api/admin/session", (req, res) =>
    res.json({
      loggedIn: isLoggedIn(req, database),
      adminCredentialsMissing: isAdminCredentialsMissing(database),
    })
  );
  router.post("/api/admin/login", (req, res) => {
    const originError = assertSameOrigin(req);
    if (originError) {
      res.status(403).json({ error: originError });
      return;
    }
    if (isAdminCredentialsMissing(database)) {
      res.status(428).json({ error: "setup_required" });
      return;
    }
    const rateError = checkLoginRateLimit(req);
    if (rateError) {
      res.status(429).json({ error: rateError });
      return;
    }
    const pw = String(req.body?.password ?? "");
    if (!verifyAdminPassword(database, pw)) {
      recordLoginFailure(req);
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    clearLoginFailures(req);
    const token = createSessionToken(getAdminSessionSecret(database));
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    setSessionCookie(res, token, secure);
    res.json({ ok: true });
  });
  router.post("/api/admin/logout", (req, res) => {
    const originError = assertSameOrigin(req);
    if (originError) {
      res.status(403).json({ error: originError });
      return;
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  router.post("/api/admin/password", requireAdmin(database), (req, res) => {
    const originError = assertSameOrigin(req);
    if (originError) {
      res.status(403).json({ error: originError });
      return;
    }
    try {
      changeAdminPassword(
        database,
        String(req.body?.currentPassword ?? ""),
        String(req.body?.newPassword ?? "")
      );
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.get("/api/admin/settings", requireAdmin(database), (_req, res) =>
    res.json(getSettings(database))
  );
  router.put("/api/admin/settings", requireAdmin(database), (req, res) => {
    const result = persistSettings(
      (req.body || {}) as Record<string, unknown>,
      env,
      database,
      requestLocale(req)
    );
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.settings);
  });
  router.post("/api/admin/settings/save-and-generate", requireAdmin(database), (req, res) => {
    const saved = persistSettings(
      (req.body || {}) as Record<string, unknown>,
      env,
      database,
      requestLocale(req)
    );
    if ("error" in saved) {
      res.status(400).json({ error: saved.error });
      return;
    }
    try {
      const workflowId = startPacWorkflow(database, env.dataDir, "save-and-generate");
      res.status(202).json({
        settings: saved.settings,
        workflowId,
        status: getWorkflowRun(database, workflowId)?.status ?? "pending",
      });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.post("/api/admin/webhook-test", requireAdmin(database), async (req, res) => {
    const c = normalizeWebhookConfig(req.body?.config ?? req.body),
      errors = validateWebhookConfig(c);
    if (errors.length) {
      res.status(400).json({ error: errors.join("\n") });
      return;
    }
    res.json(await sendWebhookTest(c, getSettings(database).timezone));
  });
  router.post("/api/admin/generate", requireAdmin(database), (_req, res) => {
    try {
      const workflowId = startPacWorkflow(database, env.dataDir, "manual");
      res
        .status(202)
        .json({ workflowId, status: getWorkflowRun(database, workflowId)?.status ?? "pending" });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
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
    walk(env.dataDir);
    const dbBytes = ["genpac.db", "genpac.db-wal", "genpac.db-shm"].reduce((sum, name) => {
      try {
        return sum + fs.statSync(path.join(env.dataDir, name)).size;
      } catch {
        return sum;
      }
    }, 0);
    const counts = database
      .query(
        "SELECT (SELECT COUNT(*) FROM generation_log) AS generationLogs,(SELECT COUNT(*) FROM access_events) AS accessEvents,(SELECT COUNT(*) FROM proxy_probe_runs) AS proxyProbeRuns,(SELECT COUNT(*) FROM workflow_runs) AS workflows,(SELECT COUNT(*) FROM workflow_runs WHERE status IN ('pending','running')) AS activeWorkflows"
      )
      .get();
    const pacFileInfo = (name: string) => {
      try {
        const stat = fs.statSync(path.join(env.dataDir, name));
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
          fs.unlinkSync(path.join(env.dataDir, name));
          deleted.push(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const fileInfo = (name: string) => {
        try {
          const stat = fs.statSync(path.join(env.dataDir, name));
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
    if (deleted.generationLogs + deleted.accessEvents + deleted.proxyProbeRuns > 0) {
      database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    }
    res.json({ deleted, retentionDays: getSettings(database).logRetentionDays });
  });
  router.post("/api/admin/logs/clear", requireAdmin(database), (_req, res) => {
    try {
      const deleted = clearOperationalLogs(database);
      database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
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
      database.run("BEGIN IMMEDIATE");
      database.run(
        "DELETE FROM generation_log; DELETE FROM access_events; DELETE FROM proxy_probe_runs; DELETE FROM workflow_runs;"
      );
      setSettings(database, DEFAULT_SETTINGS);
      database.run("COMMIT");
      database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
      for (const name of ["proxy.pac", "proxy.source.pac"]) {
        try {
          fs.unlinkSync(path.join(env.dataDir, name));
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
    const total = Number(
      (database.query("SELECT COUNT(*) AS total FROM generation_log").get() as { total: number })
        .total
    );
    const hasMore = rows.length > limit;
    res.json({
      items: rows.slice(0, limit),
      nextCursor:
        rows.length > limit ? (rows[limit - 1]?.id ?? null) : (rows[rows.length - 1]?.id ?? null),
      total,
      hasMore,
    });
  });
  router.get("/api/admin/genpac-status", requireAdmin(database), async (_req, res) =>
    res.json(await probeGenpac())
  );
  return router;
}
