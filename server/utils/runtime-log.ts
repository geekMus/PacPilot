type RuntimeLogLevel = "log" | "info" | "warn" | "error";

function isDevelopmentRuntime(): boolean {
  if (process.env.GENPAC_RUNTIME_PROFILE) {
    return process.env.GENPAC_RUNTIME_PROFILE === "development";
  }
  const profile = (process.env.GENPAC_ENV || process.env.NODE_ENV || "").toLowerCase();
  return profile === "development" || profile === "dev";
}

export function runtimeLog(
  level: RuntimeLogLevel,
  chineseMessage: string,
  ...details: unknown[]
): void {
  const development = isDevelopmentRuntime();
  const message = development ? `[开发环境] ${chineseMessage}` : chineseMessage;
  console[level](message, ...details);
}
