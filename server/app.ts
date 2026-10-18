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

  app.use(publicRoutes(env));
  app.use(adminRoutes(env, database));

  const here = typeof import.meta.dir === "string" ? import.meta.dir : path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, "../dist/client");
  const indexHtml = path.join(clientDir, "index.html");

  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  }

  const sendSpa = (_req: express.Request, res: express.Response) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).send("Frontend not built. Run bun run build:client");
      return;
    }
    res.sendFile(indexHtml);
  };

  app.get("/status", sendSpa);
  app.get("/admin", sendSpa);
  app.get(/^\/admin\/.*/, sendSpa);

  app.use((_req, res) => {
    res.status(404).send("Not Found");
  });

  return app;
}
