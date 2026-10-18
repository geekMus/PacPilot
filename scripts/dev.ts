/**
 * 开发启动器：同时跑后端（Bun --hot）与 Vite 前端。
 * 使用：bun run dev
 *
 * 强制 NODE_ENV=development，数据目录默认落在项目 ./data
 */
const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: "development",
  GENPAC_ENV: process.env.GENPAC_ENV || "development",
  // 开发默认当前目录 data；若用户已设 DATA_DIR 则尊重用户
  DATA_DIR: process.env.DATA_DIR || "./data",
  PORT: process.env.PORT || "17321",
  HOST: process.env.HOST || "0.0.0.0",
};

console.log(
  `[dev] profile=development DATA_DIR=${env.DATA_DIR} PORT=${env.PORT}`
);
if (!env.ADMIN_PASSWORD) {
  console.log(
    "[dev] 提示: 未设置 ADMIN_PASSWORD，后台 /admin 不会启用。可复制 .env.example 为 .env 后配置。"
  );
}

const server = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

const client = Bun.spawn(
  ["bunx", "--bun", "vite", "--config", "client/vite.config.ts"],
  {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env,
  }
);

const shutdown = () => {
  server.kill();
  client.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([server.exited, client.exited]);
shutdown();
