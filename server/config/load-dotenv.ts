import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * 仅在本机开发模式加载项目根目录的 .env。
 *
 * - 开发环境：若 .env 存在，其值覆盖同名进程环境变量。
 * - 未找到 .env：保留进程环境变量，不影响通过系统环境注入配置。
 * - 生产环境 / 容器：不读取 .env，只使用进程环境变量。
 *
 * NODE_ENV 和 GENPAC_ENV 是启动模式标记，由启动命令决定，不从 .env 覆盖。
 */
export function loadDevelopmentDotEnv(): boolean {
  const inContainer =
    process.env.RUNNING_IN_DOCKER === "1" ||
    Boolean(process.env.container) ||
    Boolean(process.env.KUBERNETES_SERVICE_HOST) ||
    fs.existsSync("/.dockerenv");

  if (inContainer) return false;

  const runtimeProfile = (process.env.GENPAC_ENV || "").toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const explicitDevelopment =
    runtimeProfile === "development" || runtimeProfile === "dev";
  const explicitProduction =
    runtimeProfile === "production" || runtimeProfile === "prod";

  // 明确以生产模式启动时，完全跳过 .env 文件。
  if (explicitProduction || (!explicitDevelopment && nodeEnv === "production")) {
    return false;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath) || !fs.statSync(envPath).isFile()) {
    return false;
  }

  const parsed = dotenv.parse(fs.readFileSync(envPath));

  // 未通过启动命令明确指定模式时，也避免仅凭 .env 中的生产标记加载配置。
  if (!explicitDevelopment && !nodeEnv) {
    const fileProfile = (parsed.GENPAC_ENV || "").toLowerCase();
    const fileNodeEnv = (parsed.NODE_ENV || "").toLowerCase();
    if (
      fileProfile === "production" ||
      fileProfile === "prod" ||
      fileNodeEnv === "production"
    ) {
      return false;
    }
  }

  let loaded = false;
  for (const [name, value] of Object.entries(parsed)) {
    if (name === "NODE_ENV" || name === "GENPAC_ENV") continue;
    // 开发环境 .env 明确优先于 shell 中同名的变量。
    process.env[name] = value;
    loaded = true;
  }

  return loaded;
}
