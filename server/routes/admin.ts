import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import { adminEnabled } from "../config/env";
import {
  getSettings,
  recentLogs,
  updateSettings,
} from "../db/sqlite";
import type { AppSettings, GenerationMode } from "../db/settings";
import { normalizeWebhookConfig } from "../db/settings";
import {
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  requireAdmin,
  setSessionCookie,
} from "../middleware/auth";
import { generatePac, probeGenpac } from "../services/pac-generator";
import { reschedule } from "../services/scheduler";
import { sendWebhookTest, validateWebhookConfig } from "../services/webhook";
import cron from "node-cron";

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bodyToSettings(body: Record<string, unknown>): AppSettings {
  const raw = String(body.mode ?? "");
  const mode: GenerationMode =
    raw === "remote" || raw === "genpac" ? "remote" : "custom";

  return {
    mode,
    pacProxy: String(body.pacProxy ?? ""),
    pacCompress: Boolean(body.pacCompress),
    pacPrecise: Boolean(body.pacPrecise),
    listUrl: String(body.listUrl ?? body.gfwlistUrl ?? ""),
    blockList: parseList(body.blockList),
    directList: parseList(body.directList),
    cronSchedule: String(body.cronSchedule ?? ""),
    webhookSuccessUrl: String(body.webhookSuccessUrl ?? ""),
    webhookSuccessBody: String(body.webhookSuccessBody ?? ""),
    webhookFailureUrl: String(body.webhookFailureUrl ?? ""),
    webhookFailureBody: String(body.webhookFailureBody ?? ""),
    webhookSuccessConfig: normalizeWebhookConfig(body.webhookSuccessConfig, String(body.webhookSuccessUrl ?? ""), String(body.webhookSuccessBody ?? "")),
    webhookFailureConfig: normalizeWebhookConfig(body.webhookFailureConfig, String(body.webhookFailureUrl ?? ""), String(body.webhookFailureBody ?? "")),
  };
}

export function adminRoutes(
  env: EnvConfig,
  database: AppDatabase
): Router {
  const router = Router();

  router.use("/api/admin", (req, res, next) => {
    if (!adminEnabled(env)) {
      res.status(404).json({ error: "admin disabled" });
      return;
    }
    next();
  });

  router.get("/api/admin/session", (req, res) => {
    res.json({ loggedIn: isLoggedIn(req, env) });
  });

  router.post("/api/admin/login", (req, res) => {
    const password = String(req.body?.password ?? "");
    if (!env.adminPassword || password !== env.adminPassword) {
      res.status(401).json({ error: "密码错误" });
      return;
    }
    const token = createSessionToken(env.sessionSecret);
    const secure =
      req.secure || req.headers["x-forwarded-proto"] === "https";
    setSessionCookie(res, token, secure);
    res.json({ ok: true });
  });

  router.post("/api/admin/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/api/admin/settings", requireAdmin(env), (_req, res) => {
    res.json(getSettings(database));
  });

  router.put("/api/admin/settings", requireAdmin(env), (req, res) => {
    const patch = bodyToSettings((req.body || {}) as Record<string, unknown>);
    const cronSchedule = patch.cronSchedule.trim();
    if (cronSchedule && (cronSchedule.split(/\s+/).length !== 5 || !cron.validate(cronSchedule))) {
      res.status(400).json({
        error: "Cron 表达式无效；请使用服务端支持的 5 段表达式（分 时 日 月 周）。",
      });
      return;
    }

    for (const config of [patch.webhookSuccessConfig, patch.webhookFailureConfig]) {
      const configured = Boolean(config.url.trim());
      if (configured) {
        const errors = validateWebhookConfig(config);
        if (errors.length) {
          res.status(400).json({ error: errors.join("\n") });
          return;
        }
      }
    }

    const next = updateSettings(database, patch);
    reschedule(database, env.dataDir);
    res.json(next);
  });

  router.post("/api/admin/webhook-test", requireAdmin(env), async (req, res) => {
    const config = normalizeWebhookConfig(req.body?.config ?? req.body);
    const errors = validateWebhookConfig(config);
    if (errors.length) {
      res.status(400).json({ error: errors.join("\n") });
      return;
    }
    const result = await sendWebhookTest(config);
    res.json(result);
  });

  router.post("/api/admin/generate", requireAdmin(env), async (_req, res) => {
    const result = await generatePac(database, env.dataDir);
    res.status(result.success ? 200 : 500).json(result);
  });

  router.get("/api/admin/logs", requireAdmin(env), (_req, res) => {
    res.json(recentLogs(database, 50));
  });

  router.get("/api/admin/genpac-status", requireAdmin(env), async (_req, res) => {
    const probe = await probeGenpac();
    res.json(probe);
  });

  return router;
}
