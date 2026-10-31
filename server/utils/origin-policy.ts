import { isIP } from "node:net";
import os from "node:os";

export function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

function normalizeIpAddress(value: string): string {
  // IPv6 interface addresses may contain a zone identifier, which is not part
  // of the address identity used for Origin comparison.
  return value
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
}

// 网卡地址极少变化，但全量枚举发生在每个请求的 Origin 校验里；缓存 30 秒，
// DHCP/VPN 之类的地址变化仍会在半分钟内生效，而不是逐请求枚举。
const INTERFACE_CACHE_TTL_MS = 30_000;
let interfaceCache: { addresses: ReadonlySet<string>; at: number } | null = null;

/** Local interface addresses, re-enumerated at most every 30 seconds. */
export function getLocalInterfaceAddresses(): ReadonlySet<string> {
  const now = Date.now();
  if (interfaceCache && now - interfaceCache.at < INTERFACE_CACHE_TTL_MS) {
    return interfaceCache.addresses;
  }

  const addresses = new Set<string>(["127.0.0.1", "::1"]);

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const networkInterface of interfaces ?? []) {
      if (networkInterface.internal || isIP(networkInterface.address) === 0) continue;
      addresses.add(normalizeIpAddress(networkInterface.address));
    }
  }

  interfaceCache = { addresses, at: now };
  return addresses;
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function isLocalInterfaceOrigin(
  origin: string,
  requestOrigin: string,
  localAddresses: ReadonlySet<string>
): boolean {
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(requestOrigin);
    const hostname = normalizeIpAddress(originUrl.hostname);
    // Localhost is an explicit local development address. Other hostnames are
    // not resolved here, avoiding DNS-based trust and rebinding surprises.
    // Only trust the service's effective port and Vite's fixed dev port. This
    // avoids trusting arbitrary web apps hosted on another port of this host.
    // Vite's dev server runs on port 5173 during development only. Trusting it
    // unconditionally would let any localhost page on that port forge
    // SameSite=Lax cookie requests against a production instance.
    const trustedPort =
      effectivePort(originUrl) === effectivePort(requestUrl) ||
      (process.env.PACPILOT_RUNTIME_PROFILE !== "production" &&
        effectivePort(originUrl) === 5173);
    if (!trustedPort) return false;
    if (hostname === "localhost") return true;
    if (isIP(hostname) === 0 || !localAddresses.has(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isTrustedOrigin(
  origin: string | undefined,
  requestOrigin: string,
  allowedOrigins: ReadonlySet<string>,
  localAddresses: ReadonlySet<string> = getLocalInterfaceAddresses()
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  return Boolean(
    normalizedOrigin &&
    ((normalizedRequestOrigin && normalizedOrigin === normalizedRequestOrigin) ||
      allowedOrigins.has(normalizedOrigin) ||
      isLocalInterfaceOrigin(normalizedOrigin, requestOrigin, localAddresses))
  );
}
