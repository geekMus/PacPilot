import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { runPacWorkflow } from "./services/workflow";

import { reschedule, stopScheduler } from "./services/scheduler";
import {
  createInitialAdminCredentials,
  isAdminCredentialsMissing,
} from "./services/admin-credentials";
import { trackTcpConnection } from "./services/request-monitor";
import { runtimeLog } from "./utils/runtime-log";
import { createApplicationStorage } from "./storage";

async function main(): Promise<void> {
  const env = loadEnv();
  process.env.PACPILOT_RUNTIME_PROFILE = env.runtimeProfile;
  const storage = await createApplicationStorage(env);
  const firstStart = isAdminCredentialsMissing(storage.credentials);
  const initialAdminPassword = createInitialAdminCredentials(storage.credentials, process.env.ADMIN_PASSWORD, process.env.ADMIN_SESSION_SECRET);
  const adminCredentialsMissing = isAdminCredentialsMissing(storage.credentials);
  storage.workflows.markInterrupted();
  const cleanupLogs = (): void => {
    const retentionDays = storage.settings.get().logRetentionDays;
    const deletedGenerationLogs = storage.generationLogs.cleanup(retentionDays);
    const deletedAccessEvents = storage.monitoring.cleanup(retentionDays);
    if (deletedGenerationLogs + deletedAccessEvents > 0 && env.storageDriver === "sqlite") {
      storage.maintenance.compact();
    }
  };
  cleanupLogs();
  const logCleanupTimer = setInterval(cleanupLogs, 24 * 60 * 60 * 1000);
  logCleanupTimer.unref();

  if (initialAdminPassword) {
    // 终端运行日志统一使用英文，避免 Windows 终端代码页不一致导致乱码。
    runtimeLog(
      "warn",
      `Initial administrator password (change it in the admin panel): ${initialAdminPassword}`
    );
  } else if (adminCredentialsMissing) {
    runtimeLog(
      "error",
      "Unable to initialize administrator credentials; the admin panel cannot be accessed."
    );
  }

  const app = createApp(env, storage);

  const server = app.listen(env.port, env.host, () => {
    if (!firstStart && !adminCredentialsMissing) {
      // 先开始监听端口，让管理界面能够实时查看启动工作流的状态。
      void runPacWorkflow(storage, env.dataDir, "startup")
        .catch((error) => runtimeLog("error", "PAC startup workflow failed: ", error))
        .finally(() => reschedule(storage, env.dataDir));
    }
  });

  server.on("connection", trackTcpConnection);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      runtimeLog(
        "error",
        `Port ${env.port} is already in use.\n  - Retry with a different port by setting PORT=8081 in .env or the process environment.\n  - Windows: netstat -ano | findstr :${env.port}\n  - Linux/macOS: lsof -i :${env.port} or ss -tlnp | grep ${env.port}`
      );
    } else {
      runtimeLog("error", "Server error:", err);
    }
    stopScheduler();
    clearInterval(logCleanupTimer);
    storage.close();
    process.exit(1);
  });

  const shutdown = (): void => {
    stopScheduler();
    clearInterval(logCleanupTimer);
    server.close(() => {
      storage.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  runtimeLog("error", "Server startup failed:", err);
  process.exit(1);
});
