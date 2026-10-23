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

/** Return the dotted IPv4 address embedded in any valid IPv4-mapped IPv6 form. */
function mappedIpv4Address(host: string): string | null {
  let normalized = host.toLowerCase().replace(/^\\[|\\]$/g, "").split("%")[0] ?? "";
  if (!normalized.includes(":")) return null;

  const dottedTail = normalized.match(/(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})$/);
  if (dottedTail) {
    const octets = parseIpv4(dottedTail[1]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = normalized.slice(0, -dottedTail[1].length) + high + ":" + low;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((part) => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return Number.NaN;
    return Number.parseInt(part, 16);
  });
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group))) return null;
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return null;

  const high = groups[6];
  const low = groups[7];
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join(".");
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
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd"))
    return true;
  const mappedIpv4 = mappedIpv4Address(normalized);
  if (mappedIpv4) return isBlockedIpAddress(mappedIpv4);
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    return true;
  if (isBlockedIpAddress(host)) return true;
  return false;
}

function isLoopbackOrMetadata(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "metadata.goog"
  ) {
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
