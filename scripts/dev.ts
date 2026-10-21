import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";
import { runtimeLog } from "../server/utils/runtime-log";

/**
 * 开发启动器：先完整显示 Vite 启动信息，再输出项目日志并启动后端。
 * Vite 输出直接透传，保留其原始颜色和格式，不包装进 genpac-runner 日志。
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

const client = Bun.spawn(
  [
    "bunx",
    "--bun",
    "vite",
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

      // 直接透传原始字节，保留 Vite 自己的 ANSI 颜色、进度和格式。
      if (target === "stderr") {
        process.stderr.write(value);
      } else {
        process.stdout.write(value);
      }

      if (!hasViteReady && target === "stdout") {
        pending += decoder.decode(value, { stream: true });
        if (/ready in\s+\d+\s*ms/i.test(pending)) {
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
    `Vite 在就绪前退出，退出码：${viteStartup.code}`,
  );
  process.exit(viteStartup.code ?? 1);
}

const server = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

// 等 Vite 的启动信息（包括 ready in）输出完毕后，再输出项目自身日志。
runtimeLog(
  "info",
  `开发环境启动参数已就绪；数据目录：${env.DATA_DIR}；后端端口：${env.PORT}；前端地址：http://localhost:5173`,
);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill();
  client.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const exited = await Promise.race([
  server.exited.then((code) => ({ process: "server" as const, code })),
  client.exited.then((code) => ({ process: "client" as const, code })),
]);

shutdown();
await Promise.allSettled([viteStdout, viteStderr, server.exited, client.exited]);
runtimeLog(
  "warn",
  `${exited.process === "server" ? "后端服务" : "Vite 前端"}进程已退出，退出码：${exited.code}`,
);
process.exit(exited.code ?? 0);
