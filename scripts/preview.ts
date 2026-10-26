/**
 * 本地预览包装：以生产模式启动服务端，用来验证打包产物（构建样式内联、按路由预加载、
 * 启动占位等）在真实生产路径下的表现。
 *
 * 与 `bun run start` 的区别：
 * - 默认端口 4173，避免与正在运行的开发后端（17321）冲突；
 * - 默认数据目录 ./data/preview，预览不会写入开发或生产的数据库。
 * `PORT`、`DATA_DIR` 等环境变量只要显式设置就优先生效。
 *
 * package.json 的 `preview` 脚本会先构建客户端产物，再调用本文件。
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PACPILOT_ENV = process.env.PACPILOT_ENV || "production";
process.env.PORT = process.env.PORT || "4173";
process.env.DATA_DIR = process.env.DATA_DIR || "./data/preview";

console.log(
  `预览服务（生产模式）：http://127.0.0.1:${process.env.PORT}\n` +
    `数据目录：${process.env.DATA_DIR}（首次启动会在日志中打印初始管理员密码）\n` +
    `如需与生产保持一致，可用 PORT / DATA_DIR 覆盖上面的默认值。`
);

await import("../server/index.ts");
