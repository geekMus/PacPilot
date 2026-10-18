import { loadEnv, adminEnabled } from "./config/env";
import { getDb, closeDb } from "./db/sqlite";
import { createApp } from "./app";
import { generatePac } from "./services/pac-generator";
import { reschedule, stopScheduler } from "./services/scheduler";

async function main(): Promise<void> {
  const env = loadEnv();
  const database = getDb(env.dataDir);

  console.log("[boot] genpac-runner v2 starting...");
  console.log(`[boot] dataDir=${env.dataDir} port=${env.port}`);
  console.log(
    `[boot] admin=${adminEnabled(env) ? "enabled" : "disabled (set ADMIN_PASSWORD to enable)"}`
  );

  const result = await generatePac(database, env.dataDir);
  if (!result.success) {
    console.warn("[boot] initial PAC generation failed:", result.message);
  }

  reschedule(database, env.dataDir);

  const app = createApp(env, database);
  const server = app.listen(env.port, () => {
    console.log(`[boot] listening on :${env.port}`);
    console.log(`[boot] PAC    -> http://0.0.0.0:${env.port}/proxy.pac`);
    console.log(`[boot] status -> http://0.0.0.0:${env.port}/status`);
    if (adminEnabled(env)) {
      console.log(`[boot] admin  -> http://0.0.0.0:${env.port}/admin`);
    }
  });

  const shutdown = (): void => {
    console.log("[boot] shutting down...");
    stopScheduler();
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[boot] fatal:", err);
  process.exit(1);
});
