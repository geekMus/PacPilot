import { Router } from "express";
import type { EnvConfig } from "../config/env";
import { adminEnabled } from "../config/env";
import { readPacFile } from "../services/pac-generator";
import { parsePacStatus } from "../services/pac-parser";

export function publicRoutes(env: EnvConfig): Router {
  const router = Router();

  router.get("/proxy.pac", (_req, res) => {
    const pac = readPacFile(env.dataDir);
    res.setHeader(
      "Content-Type",
      "application/x-ns-proxy-autoconfig; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(
      pac ||
        "// PAC not generated yet\nfunction FindProxyForURL(){return 'DIRECT';}\n"
    );
  });

  router.get("/", (_req, res) => {
    res.redirect(302, "/proxy.pac");
  });

  router.get("/api/meta", (_req, res) => {
    res.json({
      adminEnabled: adminEnabled(env),
      version: "2.0.0",
    });
  });

  router.get("/api/status", (_req, res) => {
    const pac = readPacFile(env.dataDir);
    res.json(parsePacStatus(pac, env.tz));
  });

  return router;
}
