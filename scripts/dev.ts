/**
 * 开发启动器：同时跑后端（Bun --hot）与 Vite 前端。
 * 使用：bun run dev
 */
const env = {
  ...process.env,
  DATA_DIR: process.env.DATA_DIR || "./data",
  PORT: process.env.PORT || "8080",
};

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
