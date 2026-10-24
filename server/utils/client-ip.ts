import { isIP } from "node:net";
import type { Request } from "express";
import { isIpInAnyCidr } from "./cidr";

export interface ClientIpConfig {
  /**
   * Number of reverse proxies in front of this service whose forwarded headers
   * are trusted. 0 disables forwarded-header handling entirely.
   */
  trustProxyHops: number;
  /**
   * Trust `CF-Connecting-IP` (set by Cloudflare, including cloudflared tunnel).
   * Honoured only when the direct peer is a trusted proxy (see
   * `trustedProxyCidrs`) or, without an allowlist, a private/loopback address.
   */
  trustCloudflare: boolean;
  /**
   * Networks the reverse proxies live in, e.g. `172.17.0.0/16` for the Docker
   * bridge. When configured, forwarded headers from any other peer are ignored.
   */
  trustedProxyCidrs: string[];
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

let config: ClientIpConfig = {
  trustProxyHops: 1,
  trustCloudflare: false,
  trustedProxyCidrs: [],
};

export function configureClientIp(next: Partial<ClientIpConfig>): void {
  config = { ...config, ...next };
}

export function getClientIpConfig(): ClientIpConfig {
  return config;
}

/**
 * Resolve the originating client address.
 *
 * Forwarded headers are only honoured when the direct peer is a trusted proxy:
 *
 * - `TRUSTED_PROXY_CIDRS` lists the networks our proxies live in (e.g. the
 *   cloudflared/docker subnet). When it is set, any other peer is treated as a
 *   direct client and its headers are ignored — this is what prevents a plain
 *   internet client from spoofing `CF-Connecting-IP` / `X-Forwarded-For`.
 * - `CF-Connecting-IP` additionally requires `TRUST_CLOUDFLARE_IP=1` **and** a
 *   trusted peer; without a configured allowlist it is never trusted.
 * - `X-Forwarded-For` is read from the right, counting trusted hops, so a client
 *   cannot prepend fake entries.
 */
export function resolveClientIp(req: Request): string {
  const peer = normalizeIp(req.socket.remoteAddress ?? "");
  const hasAllowlist = config.trustedProxyCidrs.length > 0;
  const peerTrusted = peer !== null && hasAllowlist && isIpInAnyCidr(peer, config.trustedProxyCidrs);

  // With an allowlist configured, headers from untrusted peers are ignored.
  if (hasAllowlist && !peerTrusted) return peer ?? "unknown";

  if (config.trustCloudflare && (peerTrusted || (!hasAllowlist && isPrivateAddress(peer)))) {
    const cloudflareIp = normalizeIp(headerValue(req, "cf-connecting-ip"));
    if (cloudflareIp) return cloudflareIp;
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
