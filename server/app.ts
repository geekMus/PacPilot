import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AppDatabase } from "./db/sqlite";
import type { EnvConfig } from "./config/env";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { requestMonitoringMiddleware } from "./services/request-monitor";
import { isTrustedOrigin } from "./utils/origin-policy";

export function createApp(env: EnvConfig, database: AppDatabase): express.Application {
  const app = express();

  app.disable("x-powered-by");
  // Honour X-Forwarded-* from a single reverse-proxy hop so Secure cookies and
  // client IPs are correct when TLS terminates upstream.
  app.set("trust proxy", 1);

  // Credentialed CORS must use an explicit allowlist. The SPA is served
  // from this origin by default, so cross-origin access is opt-in.
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  app.use((_req, res, next) => {
    const origin = _req.get("Origin");
    const isAdminMutation =
      _req.path.startsWith("/api/admin/") &&
      !["GET", "HEAD", "OPTIONS"].includes(_req.method);

    if (
      isAdminMutation &&
      !isTrustedOrigin(origin, `${_req.protocol}://${_req.get("host")}`, allowedOrigins)
    ) {
      res.status(403).json({ error: "untrusted_origin" });
      return;
    }

    const corsAllowed = Boolean(origin && allowedOrigins.has(origin));

    if (corsAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
      const requestedHeaders = _req.get("Access-Control-Request-Headers");
      if (requestedHeaders) {
        res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
        res.vary("Access-Control-Request-Headers");
      }
      res.vary("Origin");
    }

    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.use(requestMonitoringMiddleware(database));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use(publicRoutes(env, database));
  app.use(adminRoutes(env, database));

  const here =
    typeof import.meta.dir === "string"
      ? import.meta.dir
      : path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, "../dist/client");
  const indexHtml = path.join(clientDir, "index.html");

  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  }

  const sendSpa = (_req: express.Request, res: express.Response) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).type("text/plain").send("Frontend not built. Run: bun run build");
      return;
    }
    res.sendFile(indexHtml);
  };

  // Vue SPA：首页与后台
  app.get("/", sendSpa);
  app.get("/admin", sendSpa);
  app.get(/^\/admin\/.*/, sendSpa);

  // 其余未知路径交给 SPA 的 404 页（返回 index，由前端路由展示 404）
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    if (fs.existsSync(indexHtml)) {
      res.status(404);
      res.sendFile(indexHtml);
      return;
    }
    res.status(404).type("text/plain").send("Not Found");
  });

  return app;
}
