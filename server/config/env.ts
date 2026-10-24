import fs from "fs";
import os from "os";
import path from "path";
import { loadDevelopmentDotEnv } from "./load-dotenv";
import { isValidCidr } from "../utils/cidr";

export interface EnvConfig {
  dataDir: string;
  storageDriver: "sqlite" | "memory";
  runtimeProfile: "docker" | "production" | "development";
  port: number;
  host: string;
  /**
   * "strict" keeps the historical allowlist behaviour (same-origin / listed
   * origins only). "open" allows any browser origin, which is what a purely
   * static frontend on another host needs; admin access is then guarded by
   * bearer tokens instead of cookies.
   */
  corsMode: "strict" | "open";
  /** Trusted reverse-proxy hops used when resolving the client IP. */
  trustProxyHops: number;
  /** Trust the CF-Connecting-IP header written by Cloudflare / cloudflared. */
  trustCloudflareIp: boolean;
  /** Networks the reverse proxies live in; forwarded headers from other peers are ignored. */
  trustedProxyCidrs: string[];
  /** Initial administrator password for a first start; random when unset. */
  defaultAdminPassword?: string;
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

  const corsModeRaw = (str("CORS_MODE", "strict") || "strict").toLowerCase();
  if (corsModeRaw !== "strict" && corsModeRaw !== "open") {
    throw new Error('Invalid CORS_MODE: expected "strict" or "open".');
  }

  const trustProxyRaw = str("TRUST_PROXY_HOPS", "1")!;
  const trustProxyHops = Number(trustProxyRaw);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error("Invalid TRUST_PROXY_HOPS: expected an integer between 0 and 10.");
  }

  const trustCloudflareRaw = (str("TRUST_CLOUDFLARE_IP", "0") || "0").toLowerCase();
  const trustCloudflareIp = ["1", "true", "yes", "on"].includes(trustCloudflareRaw);

  // Comma-separated list of proxy networks. When present, forwarded headers are
  // ignored for any peer outside these ranges, which blocks spoofing.
  const trustedProxyCidrs = (str("TRUSTED_PROXY_CIDRS", "") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const cidr of trustedProxyCidrs) {
    if (!isValidCidr(cidr)) {
      throw new Error("Invalid TRUSTED_PROXY_CIDRS entry: " + cidr);
    }
  }
  if (trustCloudflareIp && trustedProxyCidrs.length === 0) {
    // Without an allowlist the CF header would be honoured from any private
    // peer; require an explicit decision so the trust boundary stays visible.
    throw new Error(
      "TRUST_CLOUDFLARE_IP requires TRUSTED_PROXY_CIDRS (e.g. 172.17.0.0/16 for the Docker bridge)."
    );
  }

  return {
    ...resolved,
    port,
    host: str("HOST", "0.0.0.0")!,
    corsMode: corsModeRaw,
    trustProxyHops,
    trustCloudflareIp,
    trustedProxyCidrs,
    defaultAdminPassword: str("DEFAULT_ADMIN_PASSWORD"),
  };
}
