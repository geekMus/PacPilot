import path from "node:path";
import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";
import { runtimeLog } from "../server/utils/runtime-log";

/**
 * 开发启动器：先确认后端可用，再启动 Vite，避免前端启动阶段的 API 代理请求被拒绝。
 * Vite 输出直接透传，保留其原始颜色和格式，不包装进项目日志。
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
      // 后端初始化时端口可能尚未监听；继续等待，同时检测子进程是否提前退出。
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
    runtimeLog(
      "error",
      `\u540e\u7aef\u670d\u52a1\u5728\u5c31\u7eea\u524d\u9000\u51fa\uff0c\u9000\u51fa\u7801\uff1a${backendReady.code}`,
    );
    process.exitCode = backendReady.code || 1;
  } else {
    runtimeLog(
      "error",
      `\u7b49\u5f85\u540e\u7aef\u542f\u52a8\u8d85\u65f6\uff08\u7b49\u5f85\u5730\u5740\uff1a${apiHealthUrl}\uff09\u3002\u8bf7\u68c0\u67e5\u4e0a\u65b9\u540e\u7aef\u9519\u8bef\u3002`,
    );
    shutdown();
    await server.exited;
    process.exit(1);
  }
  shutdown();
  await server.exited;
  process.exit();
}

// 直接调用本地 Vite CLI，避免 Windows/Git Bash 下 bunx 包装进程提前退出。
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
  runtimeLog(
    "error",
    `\u524d\u7aef Vite \u542f\u52a8\u5931\u8d25\uff0c\u9000\u51fa\u7801\uff1a${viteStartup.code}\u3002\u8bf7\u68c0\u67e5 Vite \u7684\u9519\u8bef\u8f93\u51fa\u3002`,
  );
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
  `${exited.process === "server" ? "\u540e\u7aef\u670d\u52a1" : "Vite \u524d\u7aef"}\u8fdb\u7a0b\u5df2\u9000\u51fa\uff0c\u9000\u51fa\u7801\uff1a${exited.code}`,
);
process.exit(exited.code ?? 0);
