import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";

/**
 * 开发启动器：同时跑后端（Bun --hot）与 Vite 前端。
 * 使用：bun run dev
 *
 * 开发环境优先读取项目根目录的 .env；文件不存在时使用进程环境变量。
 * 强制开发模式，数据目录默认落在项目 ./data。
 */
process.env.NODE_ENV = "development";
process.env.GENPAC_ENV = "development";
loadDevelopmentDotEnv();

const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: "development",
  GENPAC_ENV: "development",
  // .env 已加载；未配置时开发默认使用当前目录 data
  DATA_DIR: process.env.DATA_DIR || "./data",
  PORT: process.env.PORT || "17321",
  HOST: process.env.HOST || "0.0.0.0",
};

console.log(
  `[开发环境] 已启动开发模式；数据目录：${env.DATA_DIR}；后端端口：${env.PORT}；前端地址：http://localhost:5173`
);

// 子进程输出原样转发；服务端日志属于服务日志，不在开发启动器中改写。
const server = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

const client = Bun.spawn(["bunx", "--bun", "vite", "--config", "client/vite.config.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

const shutdown = () => {
  server.kill();
  client.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([server.exited, client.exited]);
shutdown();
