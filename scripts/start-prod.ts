/**
 * 生产启动包装：设置 NODE_ENV=production 后启动服务端。
 * 使用：bun run scripts/start-prod.ts  或  package.json 的 start 脚本
 *
 * 数据目录将按操作系统落到标准位置（可用 DATA_DIR 覆盖）。
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.GENPAC_ENV = process.env.GENPAC_ENV || "production";

await import("../server/index.ts");
