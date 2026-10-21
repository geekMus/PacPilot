import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";
import { runtimeLog } from "../server/utils/runtime-log";

/**
 * 开发启动器：同时运行后端（Bun --hot）与 Vite 前端。
 * 使用：bun run dev
 *
 * 子进程日志统一经过本启动器转发：Vite 每行带独立标识，避免与服务日志混在一起。
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

runtimeLog(
  "info",
  `开发环境启动参数已就绪；数据目录：${env.DATA_DIR}；后端端口：${env.PORT}；前端地址：http://localhost:5173`,
);

const server = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

const client = Bun.spawn(
  ["bunx", "--bun", "vite", "--config", "client/vite.config.ts", "--clearScreen", "false"],
  {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: { ...env, FORCE_COLOR: env.FORCE_COLOR || "1" },
  },
);

async function forwardViteOutput(
  stream: ReadableStream<Uint8Array> | null,
  target: "stdout" | "stderr",
): Promise<void> {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const writeLine = (line: string): void => {
    runtimeLog(target === "stderr" ? "warn" : "info", `[vite] ${line}`);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) writeLine(line);
    }

    pending += decoder.decode();
    if (pending.length > 0) writeLine(pending);
  } finally {
    reader.releaseLock();
  }
}

const viteStdout = forwardViteOutput(client.stdout, "stdout");
const viteStderr = forwardViteOutput(client.stderr, "stderr");

const shutdown = () => {
  server.kill();
  client.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const exited = await Promise.race([
  server.exited.then((code) => ({ process: "server" as const, code })),
  client.exited.then((code) => ({ process: "client" as const, code })),
]);

server.kill();
client.kill();
await Promise.allSettled([viteStdout, viteStderr, server.exited, client.exited]);
runtimeLog(
  "warn",
  `${exited.process === "server" ? "后端服务" : "Vite 前端"}进程已退出，退出码：${exited.code}`,
);
process.exit(exited.code ?? 0);
