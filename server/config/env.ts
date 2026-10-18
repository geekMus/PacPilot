import path from "path";

/**
 * 仅保留启动级环境变量。
 * 业务配置（模式、代理、列表、Webhook、Cron 等）全部存 SQLite，由后台面板管理。
 */
export interface EnvConfig {
  /** 数据目录：存放 SQLite 与 proxy.pac */
  dataDir: string;
  /** HTTP 监听端口 */
  port: number;
  /**
   * 后台登录密码。
   * 未设置时不启用后台管理路由与页面。
   */
  adminPassword: string | null;
  /** Cookie 签名密钥；未设置时使用派生值 */
  sessionSecret: string;
  /** 时区（仅影响日志时间显示，可选） */
  tz: string;
}

function str(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

export function loadEnv(): EnvConfig {
  const dataDir = path.resolve(str("DATA_DIR", "/data")!);
  const adminPassword = str("ADMIN_PASSWORD") ?? null;
  const sessionSecret =
    str("SESSION_SECRET") ??
    (adminPassword
      ? `genpac-runner:${adminPassword}`
      : "genpac-runner-disabled-admin");

  return {
    dataDir,
    port: Number(str("PORT", "8080")),
    adminPassword,
    sessionSecret,
    tz: str("TZ", "Asia/Shanghai")!,
  };
}

export const adminEnabled = (env: EnvConfig): boolean =>
  Boolean(env.adminPassword && env.adminPassword.length > 0);
