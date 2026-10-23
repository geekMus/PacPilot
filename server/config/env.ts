import fs from "fs";
import os from "os";
import path from "path";
import { loadDevelopmentDotEnv } from "./load-dotenv";

export interface EnvConfig {
  dataDir: string;
  storageDriver: "sqlite" | "memory";
  runtimeProfile: "docker" | "production" | "development";
  port: number;
  host: string;
}

function str(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function isContainer(): boolean {
  if (
    process.env.RUNNING_IN_DOCKER === "1" ||
    process.env.container ||
    process.env.KUBERNETES_SERVICE_HOST
  ) return true;
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

function isProduction(): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const appEnv = (process.env.PACPILOT_ENV || "").toLowerCase();
  if (appEnv === "production" || appEnv === "prod") return true;
  if (appEnv === "development" || appEnv === "dev") return false;
  return nodeEnv === "production";
}

function productionDataDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA || process.env.APPDATA || path.join(home, "AppData", "Local");
    return path.join(base, "PacPilot");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "PacPilot");
  }
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "PacPilot");
  return path.join(home, ".local", "share", "PacPilot");
}

function resolveDataDir(): Pick<EnvConfig, "dataDir" | "storageDriver" | "runtimeProfile"> {
  const driver = (str("STORAGE_DRIVER", "sqlite") || "sqlite").toLowerCase();
  if (driver !== "sqlite" && driver !== "memory") {
    throw new Error('Invalid STORAGE_DRIVER: expected "sqlite" or "memory".');
  }

  // Memory mode keeps all application state and PAC artifacts in process-local memory.
  // It does not initialize SQLite or write application data files.
  if (driver === "memory") {
    return {
      dataDir: ":memory:",
      storageDriver: "memory",
      runtimeProfile: isProduction() ? "production" : "development",
    };
  }

  if (isContainer()) {
    return { dataDir: path.resolve("/data"), storageDriver: "sqlite", runtimeProfile: "docker" };
  }

  const fromEnv = str("DATA_DIR");
  if (fromEnv) {
    return {
      dataDir: path.resolve(fromEnv),
      storageDriver: "sqlite",
      runtimeProfile: isProduction() ? "production" : "development",
    };
  }

  if (isProduction()) {
    return {
      dataDir: path.resolve(productionDataDir()),
      storageDriver: "sqlite",
      runtimeProfile: "production",
    };
  }

  return {
    dataDir: path.resolve(process.cwd(), "data"),
    storageDriver: "sqlite",
    runtimeProfile: "development",
  };
}

export function loadEnv(): EnvConfig {
  loadDevelopmentDotEnv();
  const resolved = resolveDataDir();
  const portRaw = str("PORT", "17321")!;
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid PORT: " + portRaw);
  }
  return { ...resolved, port, host: str("HOST", "0.0.0.0")! };
}
