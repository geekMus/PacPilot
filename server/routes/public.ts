import { Router } from "express";
import type { EnvConfig } from "../config/env";
import { pacFileMtime, readPacFile, readPacSourceFile } from "../services/pac-generator";
import { parsePacStatus } from "../services/pac-parser";
import type { AppDatabase } from "../db/sqlite";
import type { ApplicationStorage } from "../storage/repositories";
import { APP_VERSION, PROJECT_URL } from "../version";

function sendPac(req: import("express").Request, res: import("express").Response, dataDir: string) {
  const fallback =
    "// 尚未生成 PAC；临时回退策略为所有请求直连\nfunction FindProxyForURL(url, host){return 'DIRECT';}\n";
  const pac = readPacFile(dataDir) || fallback;

  // 公共状态页是 PAC 文件的主要 UI 入口；默认在浏览器中查看，?download=1 时才触发下载。
  const asDownload = req.query.download === "1" || req.query.download === "true";

  if (asDownload) {
    res.setHeader("Content-Type", "application/x-ns-proxy-autoconfig; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="proxy.pac"');
  } else {
    // text/plain + inline：多数浏览器会直接展示源码，而不是下载
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
  }
  res.setHeader("Cache-Control", "no-store");
  res.send(pac);
}

export function publicRoutes(env: EnvConfig, database: AppDatabase, storage: ApplicationStorage): Router {
  const router = Router();

  router.get("/proxy.pac", (req, res) => sendPac(req, res, env.dataDir));

  router.get("/api/meta", (_req, res) => {
    res.json({
      adminEnabled: true,
      version: APP_VERSION,
      repositoryUrl: PROJECT_URL,
    });
  });

  router.get("/api/status", (_req, res) => {
    const pacSource = readPacSourceFile(env.dataDir);
    res.json(parsePacStatus(pacSource, storage.settings.get().timezone, pacFileMtime(env.dataDir)));
  });

  return router;
}
