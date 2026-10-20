import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";

/**
 * 仅启动后端（开发模式）。跨平台设置 NODE_ENV，避免 Windows cmd 不支持 NODE_ENV=x 前缀。
 */
process.env.NODE_ENV = "development";
process.env.GENPAC_ENV = "development";
loadDevelopmentDotEnv();

if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = "./data";
}

// --hot 需由 CLI 传入；此处直接跑（dev:server 脚本用 bun --hot 调本文件亦可）
// 实际热重载：设置 env 后 spawn hot server
const env = { ...process.env };
console.log(
  `[开发环境] 正在启动后端服务；数据目录：${env.DATA_DIR || "./data"}；监听地址：${env.HOST || "0.0.0.0"}:${env.PORT || "17321"}`
);
// 子进程输出原样转发；服务端日志属于服务日志，不在开发启动器中改写。
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
