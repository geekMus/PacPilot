import { Router } from "express";
import { getRenderedPacBody } from "../services/pac-generator";
import { parsePacStatus } from "../services/pac-parser";
import type { ApplicationStorage } from "../storage/repositories";
import { APP_VERSION, PROJECT_URL } from "../version";
import { runtimeLog } from "../utils/runtime-log";

const FALLBACK_PAC =
  "// PacPilot 尚未能构建 PAC（可能是远程规则未拉取）；临时回退策略为所有请求直连\n" +
  "function FindProxyForURL(url, host){return 'DIRECT';}\n";

/**
 * ETag comparison supporting the weak validator prefix and comma-separated
 * lists, as browsers may send either form.
 */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((part) => part.trim().replace(/^W\//, ""))
    .some((part) => part === etag);
}

async function sendPac(
  req: import("express").Request,
  res: import("express").Response,
  storage: ApplicationStorage
): Promise<void> {
  let body: string;
  let etag: string;
  let cacheState: string;

  try {
    const rendered = await getRenderedPacBody(storage);
    body = rendered.body;
    etag = rendered.etag;
    cacheState = rendered.stale ? "stale" : "hit";
  } catch (error) {
    // Rendering can only fail before the first remote fetch; serve a DIRECT
    // fallback instead of an empty response so clients stay online.
    runtimeLog("error", "PAC rendering failed: ", error);
    body = FALLBACK_PAC;
    etag = '"fallback"';
    cacheState = "fallback";
  }

  // The public status page is the main UI entry for the PAC body: show it
  // inline by default, and only trigger a download with ?download=1.
  const asDownload = req.query.download === "1" || req.query.download === "true";

  res.setHeader("ETag", etag);
  // `no-cache` lets clients keep a copy but always revalidate, which is how the
  // ETag turns into a 304 instead of a full body transfer.
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Pac-Cache", cacheState);

  if (etagMatches(req.get("if-none-match"), etag)) {
    res.status(304).end();
    return;
  }

  if (asDownload) {
    res.setHeader("Content-Type", "application/x-ns-proxy-autoconfig; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="proxy.pac"');
  } else {
    // text/plain + inline：多数浏览器会直接展示源码，而不是下载
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
  }
  res.send(body);
}

export function publicRoutes(storage: ApplicationStorage): Router {
  const router = Router();

  router.get("/pac", (req, res) => void sendPac(req, res, storage));

  router.get("/api/meta", (_req, res) => {
    res.json({
      adminEnabled: true,
      version: APP_VERSION,
      repositoryUrl: PROJECT_URL,
    });
  });

  router.get("/api/status", async (_req, res) => {
    let source = "";
    let builtAt: Date | null = null;
    try {
      const rendered = await getRenderedPacBody(storage);
      source = rendered.source;
      builtAt = new Date(rendered.builtAt);
    } catch {
      source = "";
    }
    res.json(
      parsePacStatus(source, (await storage.settings.get()).timezone, builtAt)
    );
  });

  return router;
}
