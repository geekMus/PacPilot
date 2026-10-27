import { Router } from "express";
import type { ApplicationStorage } from "../storage/repositories";
import type { EnvConfig } from "../config/env";

import type { AppSettings, GenerationMode } from "../../shared/contracts";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { requireAdmin } from "../middleware/auth";
import { validatePacProxyString } from "../services/pac-generator";
import { startPacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { invalidateRenderedPac, readRuleSource } from "../services/pac-runtime";
import { refreshRemoteRules } from "../services/pac-generator";
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
    pacObfuscate: Boolean(b.pacObfuscate),
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
  };
}
function requestLocale(req: import("express").Request): "zh_CN" | "en_US" {
  return resolveLocale(req.get("accept-language"));
}
async function persistSettings(
  body: Record<string, unknown>,
  env: EnvConfig,
  storage: ApplicationStorage,
  locale: "zh_CN" | "en_US"
): Promise<{ settings: AppSettings } | { error: string }> {
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
  const proxyError = validatePacProxyString(p.pacProxy, locale);
  if (proxyError) return { error: proxyError };
  const expr = p.cronSchedule.trim();
  if (expr && (expr.split(/\s+/).length !== 5 || !cron.validate(expr)))
    return { error: serverT(locale, "serverErrors.invalidCron") };
  const settings = await storage.settings.update(p);
  reschedule(storage, env.dataDir);
  // Any render input may have changed (mode, proxy string, compression, rule
  // lists, remote URL); drop the cached body so the next request rebuilds it.
  invalidateRenderedPac();
  // Switching to remote mode must fetch the list before a PAC can be built.
  if (settings.mode === "remote" && settings.listUrl) {
    const previousSource = await readRuleSource(storage);
    const needsFetch = !previousSource || previousSource.url !== settings.listUrl;
    if (needsFetch) {
      const refreshed = await refreshRemoteRules(storage, locale);
      if (!refreshed.ok) {
        return { error: refreshed.message };
      }
    } else {
      void refreshRemoteRules(storage, locale).catch(() => undefined);
    }
  }
  return { settings };
}

export function adminSettingsRoutes(env: EnvConfig, storage: ApplicationStorage): Router {
  const router = Router();
  router.get("/api/admin/settings", requireAdmin(storage.credentials), async (_req, res) =>
    res.json(await storage.settings.get())
  );
  router.put("/api/admin/settings", requireAdmin(storage.credentials), async (req, res) => {
    const result = await persistSettings(
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
  router.post(
    "/api/admin/settings/save-and-generate",
    requireAdmin(storage.credentials),
    async (req, res) => {
      const saved = await persistSettings(
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
        const workflowId = await startPacWorkflow(
          storage,
          env.dataDir,
          "save-and-generate",
          requestLocale(req)
        );
        res.status(202).json({
          settings: saved.settings,
          workflowId,
          status: (await storage.workflows.get(workflowId))?.status ?? "pending",
        });
      } catch (e) {
        res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  );
  return router;
}
