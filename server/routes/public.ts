import { Router } from "express";
import type { EnvConfig } from "../config/env";
import { adminEnabled } from "../config/env";
import { readPacFile } from "../services/pac-generator";
import { parsePacStatus } from "../services/pac-parser";

function sendPac(
  req: import("express").Request,
  res: import("express").Response,
  dataDir: string
) {
  const pac =
    readPacFile(dataDir) ||
    "// PAC not generated yet\nfunction FindProxyForURL(){return 'DIRECT';}\n";

  // 默认在浏览器中查看；?download=1 时才触发下载
  const asDownload =
    req.query.download === "1" || req.query.download === "true";

  if (asDownload) {
    res.setHeader(
      "Content-Type",
      "application/x-ns-proxy-autoconfig; charset=utf-8"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="proxy.pac"'
    );
  } else {
    // text/plain + inline：多数浏览器会直接展示源码，而不是下载
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
  }
  res.setHeader("Cache-Control", "no-store");
  res.send(pac);
}

export function publicRoutes(env: EnvConfig): Router {
  const router = Router();

  router.get("/proxy.pac", (req, res) => sendPac(req, res, env.dataDir));

  router.get("/api/meta", (_req, res) => {
    res.json({
      adminEnabled: adminEnabled(env),
      version: "2.1.1",
    });
  });

  router.get("/api/status", (_req, res) => {
    const pac = readPacFile(env.dataDir);
    res.json(parsePacStatus(pac, env.tz));
  });

  return router;
}
