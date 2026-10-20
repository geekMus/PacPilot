/**
 * Helpers that keep outbound HTTP(S) fetches from targeting obvious internal
 * or metadata endpoints (basic SSRF guard for self-hosted deployments).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

/** True for loopback, link-local, RFC1918, CGNAT, and cloud metadata ranges. */
export function isBlockedIpAddress(host: string): boolean {
  const v4 = parseIpv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpAddress(normalized.slice(7));
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isBlockedIpAddress(host)) return true;
  return false;
}

function isLoopbackOrMetadata(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal" || host === "metadata.goog") {
    return true;
  }
  if (isBlockedIpAddress(host)) {
    const v4 = host.split(".").map(Number);
    if (v4.length === 4 && v4[0] === 169 && v4[1] === 254) return true;
    if (host === "127.0.0.1" || host === "::1" || host.startsWith("127.")) return true;
  }
  return host === "127.0.0.1" || host.startsWith("127.") || host === "::1";
}

/**
 * Validate that a user-supplied URL is plain HTTP(S) without credentials.
 * By default also rejects private/loopback/metadata hosts (SSRF guard for
 * remote rule downloads). Pass allowPrivateHosts for intentional LAN webhooks.
 */
export function assertSafeHttpUrl(
  raw: string,
  label: string,
  options: { allowPrivateHosts?: boolean } = {}
): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${label} is invalid; provide a full HTTP(S) URL.`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `${label} must use the HTTP or HTTPS scheme.`;
  }
  if (!url.hostname) {
    return `${label} is missing a hostname.`;
  }
  if (url.username || url.password) {
    return `${label} must not include a URL username or password.`;
  }
  if (options.allowPrivateHosts) {
    if (isLoopbackOrMetadata(url.hostname)) {
      return `${label} must not target loopback or cloud metadata addresses.`;
    }
    return null;
  }
  if (isBlockedHostname(url.hostname)) {
    return `${label} must not target loopback, private, or cloud metadata addresses (SSRF protection).`;
  }
  return null;
}


