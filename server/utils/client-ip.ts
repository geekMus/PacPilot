import { isIP } from "node:net";
import type { Request } from "express";

export interface ClientIpConfig {
  /**
   * Number of reverse proxies in front of this service whose forwarded headers
   * are trusted. 0 disables forwarded-header handling entirely.
   */
  trustProxyHops: number;
  /**
   * Trust `CF-Connecting-IP` (set by Cloudflare, including cloudflared tunnel).
   * Only honoured when the direct peer is a private/loopback address, which is
   * the case for a tunnel sidecar or a local proxy.
   */
  trustCloudflare: boolean;
}

const PRIVATE_V4 = [
  [/^10\./, 8],
  [/^192\.168\./, 16],
  [/^172\.(1[6-9]|2\d|3[01])\./, 12],
  [/^127\./, 8],
  [/^169\.254\./, 16],
] as const;

export function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/^\[|\]$/g, "");
  // Strip a trailing ":port" for IPv4-mapped or plain IPv4 values.
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  value = value.replace(/^::ffff:/i, "").split("%")[0];
  return isIP(value) > 0 ? value.toLowerCase() : null;
}

export function isPrivateAddress(ip: string | null): boolean {
  if (!ip) return false;
  if (ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  if (isIP(ip) === 4) {
    return PRIVATE_V4.some(([pattern]) => pattern.test(ip));
  }
  return false;
}

function headerValue(req: Request, name: string): string {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
}

let config: ClientIpConfig = { trustProxyHops: 1, trustCloudflare: false };

export function configureClientIp(next: Partial<ClientIpConfig>): void {
  config = { ...config, ...next };
}

export function getClientIpConfig(): ClientIpConfig {
  return config;
}

/**
 * Resolve the originating client address.
 *
 * Order matters: `CF-Connecting-IP` is authoritative behind Cloudflare Tunnel
 * (the tunnel peer is always a private docker/loopback address, and the header
 * is written by the edge). Plain `X-Forwarded-For` is only read when hops are
 * configured, counting from the right so a client cannot prepend fake hops.
 */
export function resolveClientIp(req: Request): string {
  const peer = normalizeIp(req.socket.remoteAddress ?? "");

  if (config.trustCloudflare) {
    const cloudflareIp = normalizeIp(headerValue(req, "cf-connecting-ip"));
    if (cloudflareIp && (peer === null || isPrivateAddress(peer))) return cloudflareIp;
  }

  if (config.trustProxyHops > 0) {
    const forwarded = headerValue(req, "x-forwarded-for")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (forwarded.length) {
      const index = Math.max(0, forwarded.length - config.trustProxyHops);
      const candidate = normalizeIp(forwarded[index]);
      if (candidate) return candidate;
    }
    const expressIp = normalizeIp(req.ip ?? undefined);
    if (expressIp) return expressIp;
  }

  return peer ?? "unknown";
}
