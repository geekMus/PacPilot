import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AppDatabase } from "./db/sqlite";
import type { EnvConfig } from "./config/env";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";

export function createApp(
  env: EnvConfig,
  database: AppDatabase
): express.Application {
  const app = express();

  app.disable("x-powered-by");
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
      res.status(503).type("text/plain").send(
        "Frontend not built. Run: bun run build"
      );
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
