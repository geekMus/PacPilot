import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { EnvConfig } from "../config/env";
import { adminEnabled } from "../config/env";

const COOKIE_NAME = "genpac_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(secret: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `ok.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [flag, expStr, sig] = parts;
  if (flag !== "ok") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${flag}.${expStr}`;
  const expected = sign(payload, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

export function setSessionCookie(
  res: Response,
  token: string,
  secure: boolean
): void {
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

export function requireAdmin(env: EnvConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!adminEnabled(env)) {
      res.status(404).json({ error: "admin disabled" });
      return;
    }
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!verifySessionToken(token, env.sessionSecret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

export function isLoggedIn(req: Request, env: EnvConfig): boolean {
  if (!adminEnabled(env)) return false;
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  return verifySessionToken(token, env.sessionSecret);
}

export { COOKIE_NAME };
