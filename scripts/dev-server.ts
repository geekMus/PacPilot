import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";

/**
 * 仅启动后端（开发模式）。跨平台设置 NODE_ENV，避免 Windows cmd 不支持 NODE_ENV=x 前缀。
 */
process.env.NODE_ENV = "development";
process.env.PACPILOT_ENV = "development";
loadDevelopmentDotEnv();

if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = "./data";
}

// --hot 需由 CLI 传入；此处直接跑（dev:server 脚本用 bun --hot 调本文件亦可）
// 实际热重载：设置 env 后 spawn hot server
const env = { ...process.env };
// 子进程输出原样转发；不额外输出重复的启动参数日志。
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
