/**
 * 仅启动后端（开发模式）。跨平台设置 NODE_ENV，避免 Windows cmd 不支持 NODE_ENV=x 前缀。
 */
process.env.NODE_ENV = "development";
process.env.GENPAC_ENV = process.env.GENPAC_ENV || "development";
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = "./data";
}

// --hot 需由 CLI 传入；此处直接跑（dev:server 脚本用 bun --hot 调本文件亦可）
// 实际热重载：package 里用 bun --hot scripts/dev-server.ts 不行对 import
// 改为设置 env 后 spawn hot server
const env = { ...process.env };
const child = Bun.spawn(["bun", "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

const shutdown = () => {
  child.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await child.exited;
process.exit(child.exitCode ?? 0);
