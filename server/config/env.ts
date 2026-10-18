import fs from "fs";
import os from "os";
import path from "path";
import { loadDevelopmentDotEnv } from "./load-dotenv";

/**
 * 仅保留启动级环境变量。
 * 业务配置（模式、代理、列表、Webhook、Cron 等）全部存 SQLite，由后台面板管理。
 *
 * 配置来源：
 * - 本机开发：若项目根目录存在 .env，文件中的值覆盖同名进程环境变量。
 * - 没有 .env 时：使用系统/进程环境变量。
 * - 生产环境和容器：不加载 .env，只使用进程环境变量。
 *
 * 数据目录默认值：
 * - Docker / 容器 → /data
 * - 生产环境 → 各操作系统标准数据目录
 * - 开发环境 → 当前工作目录下的 ./data
 */
export interface EnvConfig {
  /** 数据目录：存放 SQLite 与 proxy.pac（绝对路径） */
  dataDir: string;
  /** 当前解析到的运行环境标签，便于日志与排查 */
  runtimeProfile: "docker" | "production" | "development";
  /** HTTP 监听端口 */
  port: number;
  /** 监听地址，默认 0.0.0.0 */
  host: string;
  /**
   * 后台登录密码。
   * 未设置时不启用后台管理路由与页面。
   */
  adminPassword: string | null;
  /** Cookie 签名密钥；未设置时使用派生值 */
  sessionSecret: string;
  /** 时区（日志与状态页时间显示） */
  tz: string;
}

function str(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function isContainer(): boolean {
  if (
    process.env.RUNNING_IN_DOCKER === "1" ||
    process.env.container ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return true;
  }
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

function isProduction(): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const genpacEnv = (process.env.GENPAC_ENV || "").toLowerCase();
  if (genpacEnv === "production" || genpacEnv === "prod") return true;
  if (genpacEnv === "development" || genpacEnv === "dev") return false;
  return nodeEnv === "production";
}

/**
 * 生产环境、非容器时的默认数据目录（遵循各平台惯例，无需管理员权限即可写入）：
 * - Windows: %LOCALAPPDATA%\genpac-runner
 * - macOS:   ~/Library/Application Support/genpac-runner
 * - Linux:   $XDG_DATA_HOME/genpac-runner 或 ~/.local/share/genpac-runner
 */
function productionDataDir(): string {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(home, "AppData", "Local");
    return path.join(base, "genpac-runner");
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "genpac-runner");
  }

  // Linux 及其他 Unix
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) {
    return path.join(xdg, "genpac-runner");
  }
  return path.join(home, ".local", "share", "genpac-runner");
}

function resolveDataDir(): {
  dataDir: string;
  runtimeProfile: EnvConfig["runtimeProfile"];
} {
  const fromEnv = str("DATA_DIR");
  if (fromEnv) {
    // 显式指定时仍标注 profile，便于日志理解
    const profile = isContainer()
      ? "docker"
      : isProduction()
        ? "production"
        : "development";
    return { dataDir: path.resolve(fromEnv), runtimeProfile: profile };
  }

  if (isContainer()) {
    return { dataDir: path.resolve("/data"), runtimeProfile: "docker" };
  }

  if (isProduction()) {
    return {
      dataDir: path.resolve(productionDataDir()),
      runtimeProfile: "production",
    };
  }

  return {
    dataDir: path.resolve(process.cwd(), "data"),
    runtimeProfile: "development",
  };
}

export function loadEnv(): EnvConfig {
  // 如果 .env 不存在、或当前为生产/容器环境，此函数不修改现有环境变量。
  loadDevelopmentDotEnv();

  const { dataDir, runtimeProfile } = resolveDataDir();
  const adminPassword = str("ADMIN_PASSWORD") ?? null;
  const sessionSecret =
    str("SESSION_SECRET") ??
    (adminPassword
      ? `genpac-runner:${adminPassword}`
      : "genpac-runner-disabled-admin");

  const portRaw = str("PORT", "17321")!;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  return {
    dataDir,
    runtimeProfile,
    port,
    host: str("HOST", "0.0.0.0")!,
    adminPassword,
    sessionSecret,
    tz: str("TZ", "Asia/Shanghai")!,
  };
}

export const adminEnabled = (env: EnvConfig): boolean =>
  Boolean(env.adminPassword && env.adminPassword.length > 0);
