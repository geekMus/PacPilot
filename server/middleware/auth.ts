import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getAdminSessionSecret, isAdminCredentialsMissing } from "../services/admin-credentials";
import type { AdminCredentialRepository } from "../storage/repositories";

const COOKIE_NAME = "pacpilot_admin_session";
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
    sameSite: secure ? "none" : "lax",
    secure,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function requireAdmin(repository: AdminCredentialRepository) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isAdminCredentialsMissing(repository)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!verifySessionToken(token, getAdminSessionSecret(repository))) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

export function isLoggedIn(req: Request, repository: AdminCredentialRepository): boolean {
  if (isAdminCredentialsMissing(repository)) return false;
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  return verifySessionToken(token, getAdminSessionSecret(repository));
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

export { COOKIE_NAME };
