import fs from "fs";
import os from "os";
import path from "path";
import { loadDevelopmentDotEnv } from "./load-dotenv";

/** 这里只读取启动运行参数；应用设置、时区和管理员凭据统一存 SQLite。 */
export interface EnvConfig {
  dataDir: string;
  runtimeProfile: "docker" | "production" | "development";
  port: number;
  host: string;
}

function str(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function isContainer(): boolean {
  if (
    process.env.RUNNING_IN_DOCKER === "1" ||
    process.env.container ||
    process.env.KUBERNETES_SERVICE_HOST
  )
    return true;
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}
function isProduction(): boolean {
  const n = (process.env.NODE_ENV || "").toLowerCase(),
    g = (process.env.GENPAC_ENV || "").toLowerCase();
  if (g === "production" || g === "prod") return true;
  if (g === "development" || g === "dev") return false;
  return n === "production";
}
function productionDataDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA || process.env.APPDATA || path.join(home, "AppData", "Local");
    return path.join(base, "genpac-runner");
  }
  if (process.platform === "darwin")
    return path.join(home, "Library", "Application Support", "genpac-runner");
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "genpac-runner");
  return path.join(home, ".local", "share", "genpac-runner");
}
function resolveDataDir(): { dataDir: string; runtimeProfile: EnvConfig["runtimeProfile"] } {
  if (isContainer()) return { dataDir: path.resolve("/data"), runtimeProfile: "docker" };
  const fromEnv = str("DATA_DIR");
  if (fromEnv)
    return {
      dataDir: path.resolve(fromEnv),
      runtimeProfile: isProduction() ? "production" : "development",
    };
  if (isProduction())
    return { dataDir: path.resolve(productionDataDir()), runtimeProfile: "production" };
  return { dataDir: path.resolve(process.cwd(), "data"), runtimeProfile: "development" };
}
export function loadEnv(): EnvConfig {
  loadDevelopmentDotEnv();
  const resolved = resolveDataDir();
  const portRaw = isContainer() ? "17321" : str("PORT", "17321")!;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535)
    throw new Error("Invalid PORT: " + portRaw);
  return { ...resolved, port, host: str("HOST", "0.0.0.0")! };
}
