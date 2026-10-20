import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { AppDatabase } from "../db/sqlite";
import {
  getAdminSecurityStatus,
  getAdminSessionSecret,
  isAdminCredentialsMissing,
} from "../services/admin-credentials";

const COOKIE_NAME = "genpac_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sliding window login throttle (per client address). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map<string, number[]>();

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(secret: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = "ok." + exp;
  return payload + "." + sign(payload, secret);
}

export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [flag, expStr, sig] = parts;
  if (flag !== "ok") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = Buffer.from(sign(flag + "." + expStr, secret), "utf8");
  const actual = Buffer.from(sig, "utf8");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function requireAdmin(database: AppDatabase, allowPasswordChange = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isAdminCredentialsMissing(database)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!verifySessionToken(token, getAdminSessionSecret(database))) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (getAdminSecurityStatus(database).mustChangePassword && !allowPasswordChange) {
      res.status(428).json({ error: "password_change_required" });
      return;
    }
    next();
  };
}

export function isLoggedIn(req: Request, database: AppDatabase): boolean {
  if (isAdminCredentialsMissing(database)) return false;
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  return verifySessionToken(token, getAdminSessionSecret(database));
}

export function clientKey(req: Request): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    ?.trim();
  const raw = forwarded || req.socket.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/, "").slice(0, 64);
}

function pruneFailures(key: string, now: number): number[] {
  const recent = (loginFailures.get(key) || []).filter((ts) => now - ts < LOGIN_WINDOW_MS);
  if (recent.length) loginFailures.set(key, recent);
  else loginFailures.delete(key);
  return recent;
}

/** Returns null when allowed, or a human-readable error when throttled. */
export function checkLoginRateLimit(req: Request): string | null {
  const key = clientKey(req);
  const recent = pruneFailures(key, Date.now());
  if (recent.length >= LOGIN_MAX_FAILURES) {
    return "Too many login attempts，请约 15 分钟后再试。";
  }
  return null;
}

export function recordLoginFailure(req: Request): void {
  const key = clientKey(req);
  const now = Date.now();
  const recent = pruneFailures(key, now);
  recent.push(now);
  loginFailures.set(key, recent);
}

export function clearLoginFailures(req: Request): void {
  loginFailures.delete(clientKey(req));
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host.startsWith("127.")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  return false;
}

/**
 * Reject cross-site state-changing requests that carry a foreign Origin.
 * Same-origin SPA posts are allowed; missing Origin is tolerated for non-browser clients.
 * Loopback hosts (localhost / 127.0.0.1 / ::1) are always allowed so local tools
 * and mixed localhost vs 127.0.0.1 access are not blocked.
 */
export function assertSameOrigin(req: Request): string | null {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return null;
  try {
    const incoming = new URL(origin);
    const hostHeader = String(req.headers.host || "")
      .trim()
      .toLowerCase();
    if (!hostHeader) return null;
    const originHost = incoming.host.toLowerCase();
    const hostNameOnly = hostHeader.split(":")[0];
    const originName = incoming.hostname.toLowerCase();

    if (isLoopbackHostname(originName) || isLoopbackHostname(hostNameOnly)) {
      return null;
    }

    if (originHost !== hostHeader && originName !== hostNameOnly) {
      return "拒绝跨站请求。";
    }
  } catch {
    return "请求来源无效。";
  }
  return null;
}

export { COOKIE_NAME };
