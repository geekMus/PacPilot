import { isIP } from "node:net";

/** Parse a dotted IPv4 address into an unsigned 32-bit integer. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/** Parse an IPv6 address (including "::" compression and IPv4-mapped forms). */
function ipv6ToBigInt(ip: string): bigint | null {
  let text = ip.split("%")[0].toLowerCase();
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = ipv4ToInt(text.slice(lastColon + 1));
    if (v4 === null) return null;
    text =
      text.slice(0, lastColon + 1) + (v4 >>> 16).toString(16) + ":" + (v4 & 0xffff).toString(16);
  }

  const hasEllipsis = text.includes("::");
  const [head, tail] = hasEllipsis ? text.split("::") : [text, ""];
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - (headParts.length + tailParts.length);
  if (hasEllipsis ? missing < 0 : headParts.length !== 8) return null;

  const parts = hasEllipsis
    ? [...headParts, ...Array.from({ length: missing }, () => "0"), ...tailParts]
    : headParts;
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  let value = 0n;
  for (const part of parts) value = (value << 16n) + BigInt(Number.parseInt(part, 16));
  return value;
}

export function isValidCidr(cidr: string): boolean {
  const [address, bitsRaw, ...rest] = cidr.split("/");
  if (rest.length > 0) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (bitsRaw === undefined) return true;
  if (!/^\d{1,3}$/.test(bitsRaw)) return false;
  const bits = Number(bitsRaw);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [address, bitsRaw] = cidr.split("/");
  const version = isIP(address);
  if (version === 0 || isIP(ip) !== version) return false;
  const bits = bitsRaw === undefined ? (version === 4 ? 32 : 128) : Number(bitsRaw);

  if (version === 4) {
    const target = ipv4ToInt(ip);
    const network = ipv4ToInt(address);
    if (target === null || network === null) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
    return (target & mask) >>> 0 === (network & mask) >>> 0;
  }

  const target = ipv6ToBigInt(ip);
  const network = ipv6ToBigInt(address);
  if (target === null || network === null) return false;
  if (bits === 0) return true;
  const shift = BigInt(128 - bits);
  return target >> shift === network >> shift;
}

export function isIpInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((cidr) => isIpInCidr(ip, cidr));
}
