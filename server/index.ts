import { loadEnv } from "./config/env";
import { getDb, closeDb } from "./db/sqlite";
import { createApp } from "./app";
import { runPacWorkflow } from "./services/workflow";
import { cleanupOperationalLogs, markInterruptedWorkflows } from "./db/sqlite";
import { reschedule, stopScheduler } from "./services/scheduler";
import {
  createInitialAdminCredentials,
  isAdminCredentialsMissing,
} from "./services/admin-credentials";
import { trackTcpConnection } from "./services/request-monitor";
import { runtimeLog } from "./utils/runtime-log";

async function main(): Promise<void> {
  const env = loadEnv();
  process.env.GENPAC_RUNTIME_PROFILE = env.runtimeProfile;
  const database = getDb(env.dataDir);
  const firstStart = isAdminCredentialsMissing(database);
  const initialAdminPassword = createInitialAdminCredentials(database);
  const adminCredentialsMissing = isAdminCredentialsMissing(database);
  markInterruptedWorkflows(database);
  const cleanupLogs = (): void => {
    const deleted = cleanupOperationalLogs(database);
    if (deleted.generationLogs + deleted.accessEvents > 0) {
      database.run("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    }
  };
  cleanupLogs();
  const logCleanupTimer = setInterval(cleanupLogs, 24 * 60 * 60 * 1000);
  logCleanupTimer.unref();

  if (initialAdminPassword) {
    runtimeLog(
      "warn",
      `首次启动生成的管理员密码（可在后台修改）：\n${initialAdminPassword}\n能够读取此日志的人也能看到该密码，请妥善保护日志。`
    );
  } else if (adminCredentialsMissing) {
    runtimeLog("error", "无法初始化管理员凭据，管理后台将无法登录。");
  }

  const app = createApp(env, database);

  const server = app.listen(env.port, env.host, () => {
    if (!firstStart && !adminCredentialsMissing) {
      // Start listening first so the admin UI can observe the startup workflow in real time.
      void runPacWorkflow(database, env.dataDir, "startup")
        .then(({ generation }) => {
          if (!generation.success) runtimeLog("warn", `启动时 PAC 生成失败：${generation.message}`);
        })
        .catch((error) => runtimeLog("error", "启动时 PAC 工作流失败：", error))
        .finally(() => reschedule(database, env.dataDir));
    }
  });

  server.on("connection", trackTcpConnection);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      runtimeLog(
        "error",
        `端口 ${env.port} 已被占用。\n  - 更换端口：在开发环境 .env 或进程环境中设置 PORT=8081 后重试\n  - Windows 查看占用：netstat -ano | findstr :${env.port}\n  - Linux/macOS 查看占用：lsof -i :${env.port} 或 ss -tlnp | grep ${env.port}`
      );
    } else {
      runtimeLog("error", "服务发生错误：", err);
    }
    stopScheduler();
    clearInterval(logCleanupTimer);
    closeDb();
    process.exit(1);
  });

  const shutdown = (): void => {
    stopScheduler();
    clearInterval(logCleanupTimer);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  runtimeLog("error", "服务启动失败：", err);
  process.exit(1);
});
