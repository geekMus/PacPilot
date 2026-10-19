import { loadEnv } from "./config/env";
import { getDb, closeDb } from "./db/sqlite";
import { createApp } from "./app";
import { runPacWorkflow } from "./services/workflow";
import { cleanupOperationalLogs, markInterruptedWorkflows } from "./db/sqlite";
import { reschedule, stopScheduler } from "./services/scheduler";
import { ensureAdminAuth } from "./services/admin-credentials";
import { trackTcpConnection } from "./services/request-monitor";

async function main(): Promise<void> {
  const env = loadEnv();
  const database = getDb(env.dataDir);
  const adminSecurity = ensureAdminAuth(database);
  markInterruptedWorkflows(database);
  cleanupOperationalLogs(database);

  console.log("[boot] genpac-runner starting...");
  console.log(`[boot] profile=${env.runtimeProfile}`);
  console.log(`[boot] dataDir=${env.dataDir}`);
  console.log(`[boot] listen=${env.host}:${env.port}`);
  console.log("[boot] admin=enabled");
  if (adminSecurity.isDefaultPassword) console.warn("[security] 当前仍使用默认管理密码 password，请登录后台立即修改。");

  const result = await runPacWorkflow(database, env.dataDir, "startup").then((workflow) => workflow.generation);
  if (!result.success) {
    console.warn("[boot] initial PAC generation failed:", result.message);
  }

  reschedule(database, env.dataDir);

  const app = createApp(env, database);

  const server = app.listen(env.port, env.host, () => {
    const local =
      env.host === "0.0.0.0" || env.host === "::"
        ? `http://127.0.0.1:${env.port}`
        : `http://${env.host}:${env.port}`;
    console.log(`[boot] listening on ${env.host}:${env.port}`);
    console.log(`[boot] PAC    -> ${local}/proxy.pac`);
    console.log(`[boot] status -> ${local}/`);
    console.log(`[boot] admin  -> ${local}/admin`);
  });

  server.on("connection", trackTcpConnection);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[boot] 端口 ${env.port} 已被占用。\n` +
          `  - 换端口: 在开发环境 .env 或进程环境中设置 PORT=8081 后重试\n` +
          `  - Windows 查占用: netstat -ano | findstr :${env.port}\n` +
          `  - Linux/macOS: lsof -i :${env.port}  或  ss -tlnp | grep ${env.port}`
      );
    } else {
      console.error("[boot] server error:", err);
    }
    stopScheduler();
    closeDb();
    process.exit(1);
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
