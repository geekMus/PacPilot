import { Router } from "express";
import type { ApplicationStorage } from "../storage/repositories";
import type { EnvConfig } from "../config/env";

import type { AppSettings, GenerationMode } from "../db/settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "../db/settings";
import { requireAdmin } from "../middleware/auth";
import { validatePacProxyString } from "../services/pac-generator";
import { startPacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { sendWebhookTest, validateWebhookConfig } from "../services/webhook";
import cron from "node-cron";
import { resolveLocale, t as serverT } from "../../shared/i18n";
import { assertSafeHttpUrl } from "../utils/url-safety";
import { validateSettingsPayload } from "../utils/settings-validation";

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
function bodyToSettings(b: Record<string, unknown>): AppSettings {
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
  storage: ApplicationStorage,
  locale: "zh_CN" | "en_US"
): { settings: AppSettings } | { error: string } {
  const payloadError = validateSettingsPayload(body);
  if (payloadError) return { error: `Invalid settings payload: ${payloadError}` };

  const p = bodyToSettings(body);
  if (p.mode === "remote") {
    const listUrlError = assertSafeHttpUrl(p.listUrl, "rule list URL");
    if (listUrlError) return { error: listUrlError };
  }
  if (!p.timezone || !validTimeZone(p.timezone))
    return {
      error: serverT(locale, "serverErrors.invalidTimezone"),
    };
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
  const settings = storage.settings.update(p);
  reschedule(storage, env.dataDir);
  return { settings };
}

export function adminSettingsRoutes(env: EnvConfig, storage: ApplicationStorage): Router {
  const router = Router();
  router.get("/api/admin/settings", requireAdmin(storage.credentials), (_req, res) =>
    res.json(storage.settings.get())
  );
  router.put("/api/admin/settings", requireAdmin(storage.credentials), (req, res) => {
    const result = persistSettings(
      (req.body || {}) as Record<string, unknown>,
      env,
      storage,
      requestLocale(req)
    );
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.settings);
  });
  router.post("/api/admin/settings/save-and-generate", requireAdmin(storage.credentials), (req, res) => {
    const saved = persistSettings(
      (req.body || {}) as Record<string, unknown>,
      env,
      storage,
      requestLocale(req)
    );
    if ("error" in saved) {
      res.status(400).json({ error: saved.error });
      return;
    }
    try {
      const workflowId = startPacWorkflow(storage, env.dataDir, "save-and-generate");
      res.status(202).json({
        settings: saved.settings,
        workflowId,
        status: storage.workflows.get(workflowId)?.status ?? "pending",
      });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  router.post("/api/admin/webhook-test", requireAdmin(storage.credentials), async (req, res) => {
    const c = normalizeWebhookConfig(req.body?.config ?? req.body),
      errors = validateWebhookConfig(c);
    if (errors.length) {
      res.status(400).json({ error: errors.join("\n") });
      return;
    }
    res.json(await sendWebhookTest(c, storage.settings.get().timezone));
  });
  return router;
}
