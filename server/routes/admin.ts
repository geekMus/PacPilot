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
import {
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  requireAdmin,
  setSessionCookie,
} from "../middleware/auth";
import { generatePac } from "../services/pac-generator";
import { reschedule } from "../services/scheduler";

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

function bodyToSettings(body: Record<string, unknown>): Partial<AppSettings> {
  const mode: GenerationMode =
    body.mode === "genpac" ? "genpac" : "custom";

  return {
    mode,
    pacProxy: String(body.pacProxy ?? ""),
    pacCompress: Boolean(body.pacCompress),
    pacPrecise: Boolean(body.pacPrecise),
    gfwlistUrl: String(body.gfwlistUrl ?? ""),
    blockList: parseList(body.blockList),
    directList: parseList(body.directList),
    cronSchedule: String(body.cronSchedule ?? ""),
    webhookSuccessUrl: String(body.webhookSuccessUrl ?? ""),
    webhookSuccessBody: String(body.webhookSuccessBody ?? ""),
    webhookFailureUrl: String(body.webhookFailureUrl ?? ""),
    webhookFailureBody: String(body.webhookFailureBody ?? ""),
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
    const next = updateSettings(database, bodyToSettings(req.body || {}));
    reschedule(database, env.dataDir);
    res.json(next);
  });

  router.post("/api/admin/generate", requireAdmin(env), async (_req, res) => {
    const result = await generatePac(database, env.dataDir);
    res.status(result.success ? 200 : 500).json(result);
  });

  router.get("/api/admin/logs", requireAdmin(env), (_req, res) => {
    res.json(recentLogs(database, 50));
  });

  return router;
}
