import type { Request, Response } from "express";
import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { createMemoryApplicationStorage } from "./storage/memory-application";
import {
  createInitialAdminCredentials,
  isAdminCredentialsMissing,
} from "./services/admin-credentials";
import { runtimeLog } from "./utils/runtime-log";

let appPromise: Promise<ReturnType<typeof createApp>> | undefined;

async function getApplication(): Promise<ReturnType<typeof createApp>> {
  if (!appPromise) {
    appPromise = (async () => {
      process.env.NODE_ENV ||= "production";
      process.env.PACPILOT_ENV ||= "production";
      process.env.STORAGE_DRIVER ||= "memory";

      const env = loadEnv();
      const storage = createMemoryApplicationStorage();
      const firstStart = isAdminCredentialsMissing(storage.credentials);
      const initialPassword = createInitialAdminCredentials(
        storage.credentials,
        process.env.ADMIN_PASSWORD,
        process.env.ADMIN_SESSION_SECRET
      );

      if (firstStart && initialPassword) {
        runtimeLog(
          "warn",
          "Initial administrator password is configured for this ephemeral Vercel instance. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in Vercel environment variables to keep login initialization consistent across warm instances."
        );
        if (!process.env.ADMIN_PASSWORD) runtimeLog("warn", "Generated initial administrator password: " + initialPassword);
      }

      return createApp({ ...env, storageDriver: "memory", dataDir: ":memory:" }, storage);
    })();
  }
  return appPromise;
}

/** Vercel serverless entry point. All mutable application state is process-local. */
export default async function handleVercelRequest(req: Request, res: Response): Promise<void> {
  const app = await getApplication();
  const originalUrl = req.url || "/";
  if (originalUrl.split("?")[0] === "/api/proxy-pac") {
    req.url = originalUrl.replace("/api/proxy-pac", "/proxy.pac");
  }
  app(req, res);
}
