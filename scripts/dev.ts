import path from "node:path";
import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";
import { runtimeLog } from "../server/utils/runtime-log";

/**
 * 先启动后端，确认 API 可用后再启动 Vite，避免前端代理请求过早发出。
 * Vite 输出按原始字节转发，保留其格式和颜色。
 */
process.env.NODE_ENV = "development";
process.env.GENPAC_ENV = "development";
loadDevelopmentDotEnv();

const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: "development",
  GENPAC_ENV: "development",
  DATA_DIR: process.env.DATA_DIR || "./data",
  PORT: process.env.PORT || "17321",
  HOST: process.env.HOST || "0.0.0.0",
};

const apiPort = env.PORT || "17321";
const apiHealthUrl = `http://127.0.0.1:${apiPort}/api/meta`;
const server = Bun.spawn([process.execPath, "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

let shuttingDown = false;
let client: ReturnType<typeof Bun.spawn> | undefined;

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill();
  client?.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitForBackend(): Promise<boolean> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) return false;

    try {
      const response = await fetch(apiHealthUrl, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return true;
    } catch {
      // 后端初始化并监听端口需要一点时间。
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

const backendReady = await Promise.race([
  waitForBackend().then((ready) => ({ type: "ready" as const, ready })),
  server.exited.then((code) => ({ type: "exit" as const, code })),
]);

if (backendReady.type === "exit" || !backendReady.ready) {
  if (backendReady.type === "exit") {
    runtimeLog("error", `后端服务在就绪前退出，退出码：${backendReady.code}。`);
    process.exitCode = backendReady.code || 1;
  } else {
    runtimeLog("error", `等待后端启动超时（等待地址：${apiHealthUrl}）。请检查上方的后端错误日志。`);
    shutdown();
    await server.exited;
    process.exit(1);
  }
  shutdown();
  await server.exited;
  process.exit();
}

// 直接调用本地 Vite CLI，避免 Windows / Git Bash 环境下包装进程异常退出。
const viteCli = path.resolve("node_modules/vite/bin/vite.js");
client = Bun.spawn(
  [
    process.execPath,
    viteCli,
    "--config",
    "client/vite.config.ts",
    "--clearScreen",
    "false",
  ],
  {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: { ...env, FORCE_COLOR: env.FORCE_COLOR || "1" },
  },
);

let resolveViteReady!: () => void;
const viteReady = new Promise<void>((resolve) => {
  resolveViteReady = resolve;
});
let hasViteReady = false;

async function forwardViteOutput(
  stream: ReadableStream<Uint8Array> | null,
  target: "stdout" | "stderr",
): Promise<void> {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (target === "stderr") process.stderr.write(value);
      else process.stdout.write(value);

      if (!hasViteReady && target === "stdout") {
        pending += decoder.decode(value, { stream: true });
        const plainPending = pending.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
        if (/ready in\s+\d+\s*ms/i.test(plainPending)) {
          hasViteReady = true;
          resolveViteReady();
        } else if (pending.length > 2000) {
          pending = pending.slice(-500);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const viteStdout = forwardViteOutput(client.stdout, "stdout");
const viteStderr = forwardViteOutput(client.stderr, "stderr");

const viteStartup = await Promise.race([
  viteReady.then(() => ({ ready: true as const })),
  client.exited.then((code) => ({ ready: false as const, code })),
]);

if (!viteStartup.ready) {
  await Promise.allSettled([viteStdout, viteStderr]);
  runtimeLog("error", `Vite 前端启动失败，退出码：${viteStartup.code}。请检查上方的 Vite 输出。`);
  shutdown();
  process.exit(viteStartup.code ?? 1);
}

const exited = await Promise.race([
  server.exited.then((code) => ({ process: "server" as const, code })),
  client.exited.then((code) => ({ process: "client" as const, code })),
]);

shutdown();
await Promise.allSettled([viteStdout, viteStderr, server.exited, client.exited]);
runtimeLog(
  "warn",
  `${exited.process === "server" ? "后端服务" : "Vite 前端"}进程已退出，退出码：${exited.code}。`,
);
process.exit(exited.code ?? 0);
