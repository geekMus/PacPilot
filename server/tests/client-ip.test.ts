import { beforeEach, describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  configureClientIp,
  getClientIpConfig,
  isPrivateAddress,
  normalizeIp,
  resolveClientIp,
} from "../utils/client-ip";

function fakeRequest(options: {
  remoteAddress?: string;
  headers?: Record<string, string>;
  ip?: string;
}): Request {
  return {
    socket: { remoteAddress: options.remoteAddress ?? "172.17.0.2" },
    headers: options.headers ?? {},
    ip: options.ip,
    get(name: string) {
      const value = (options.headers ?? {})[name.toLowerCase()];
      return value;
    },
  } as unknown as Request;
}

describe("normalizeIp", () => {
  it("strips IPv4-mapped prefixes, brackets and zone identifiers", () => {
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:db8::1]")).toBe("2001:db8::1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("203.0.113.7:443")).toBe("203.0.113.7");
  });

  it("rejects non-IP values", () => {
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});

describe("isPrivateAddress", () => {
  it("recognises private, loopback and link-local ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("172.17.0.2")).toBe(true);
    expect(isPrivateAddress("192.168.1.10")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
  });

  it("treats public addresses as public", () => {
    expect(isPrivateAddress("203.0.113.7")).toBe(false);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("treats public IPv6 and empty input as public", () => {
    expect(isPrivateAddress("2001:db8::1")).toBe(false);
    expect(isPrivateAddress(null)).toBe(false);
    expect(isPrivateAddress("")).toBe(false);
  });
});

describe("configureClientIp", () => {
  it("merges partial updates into the current configuration", () => {
    configureClientIp({
      trustProxyHops: 3,
      trustCloudflare: true,
      trustedProxyCidrs: ["10.0.0.0/8"],
    });
    expect(getClientIpConfig()).toEqual({
      trustProxyHops: 3,
      trustCloudflare: true,
      trustedProxyCidrs: ["10.0.0.0/8"],
    });

    configureClientIp({ trustCloudflare: false });
    expect(getClientIpConfig()).toMatchObject({
      trustProxyHops: 3,
      trustCloudflare: false,
      trustedProxyCidrs: ["10.0.0.0/8"],
    });
  });
});

describe("resolveClientIp", () => {
  beforeEach(() => {
    configureClientIp({ trustProxyHops: 1, trustCloudflare: false, trustedProxyCidrs: [] });
  });

  it("uses the socket address when no proxy headers are trusted", () => {
    configureClientIp({ trustProxyHops: 0 });
    const request = fakeRequest({ headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(resolveClientIp(request)).toBe("172.17.0.2");
  });

  it("counts forwarded hops from the right so spoofed prefixes are ignored", () => {
    configureClientIp({ trustProxyHops: 1 });
    const request = fakeRequest({
      headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.7" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.7");
  });

  it("respects multiple trusted hops", () => {
    configureClientIp({ trustProxyHops: 2 });
    const request = fakeRequest({
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.5" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.7");
  });

  it("ignores CF-Connecting-IP unless explicitly enabled", () => {
    configureClientIp({ trustCloudflare: false });
    const request = fakeRequest({
      headers: { "cf-connecting-ip": "203.0.113.99", "x-forwarded-for": "203.0.113.7" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.7");
  });

  it("uses CF-Connecting-IP behind a tunnel peer when enabled", () => {
    configureClientIp({ trustCloudflare: true });
    const request = fakeRequest({
      remoteAddress: "172.18.0.4",
      headers: { "cf-connecting-ip": "203.0.113.99" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.99");
  });

  it("ignores CF-Connecting-IP from a public peer to prevent spoofing", () => {
    configureClientIp({ trustCloudflare: true, trustProxyHops: 0, trustedProxyCidrs: [] });
    const request = fakeRequest({
      remoteAddress: "198.51.100.20",
      headers: { "cf-connecting-ip": "203.0.113.99" },
    });
    expect(resolveClientIp(request)).toBe("198.51.100.20");
  });

  it("ignores X-Forwarded-For from a public peer without an allowlist", () => {
    configureClientIp({ trustProxyHops: 1, trustCloudflare: false, trustedProxyCidrs: [] });
    const request = fakeRequest({
      remoteAddress: "198.51.100.20",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(resolveClientIp(request)).toBe("198.51.100.20");
  });

  it("ignores forwarded headers from peers outside the allowlist", () => {
    configureClientIp({
      trustProxyHops: 1,
      trustCloudflare: true,
      trustedProxyCidrs: ["172.17.0.0/16"],
    });
    // Public peer: both CF and XFF headers are attacker-controlled.
    const request = fakeRequest({
      remoteAddress: "198.51.100.20",
      headers: { "cf-connecting-ip": "203.0.113.99", "x-forwarded-for": "203.0.113.7" },
    });
    expect(resolveClientIp(request)).toBe("198.51.100.20");
  });

  it("trusts forwarded headers from peers inside the allowlist", () => {
    configureClientIp({
      trustProxyHops: 1,
      trustCloudflare: true,
      trustedProxyCidrs: ["172.17.0.0/16"],
    });
    const request = fakeRequest({
      remoteAddress: "172.17.0.9",
      headers: { "cf-connecting-ip": "203.0.113.99" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.99");
  });

  it("falls back to X-Forwarded-For for allowlisted peers without CF header", () => {
    configureClientIp({
      trustProxyHops: 1,
      trustCloudflare: true,
      trustedProxyCidrs: ["172.17.0.0/16"],
    });
    const request = fakeRequest({
      remoteAddress: "172.17.0.9",
      headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.7" },
    });
    expect(resolveClientIp(request)).toBe("203.0.113.7");
  });

  it("falls back to the Express ip when forwarded entries are unusable", () => {
    configureClientIp({ trustProxyHops: 1, trustCloudflare: false, trustedProxyCidrs: [] });
    const request = fakeRequest({
      headers: { "x-forwarded-for": "garbage, also-garbage" },
      ip: "203.0.113.42",
    });
    expect(resolveClientIp(request)).toBe("203.0.113.42");
  });

  it("falls back to the socket peer when nothing usable is available", () => {
    configureClientIp({ trustProxyHops: 1, trustCloudflare: false, trustedProxyCidrs: [] });
    const request = fakeRequest({ headers: {} });
    expect(resolveClientIp(request)).toBe("172.17.0.2");
  });

  it("returns unknown when the peer address is not parseable", () => {
    configureClientIp({ trustProxyHops: 0, trustCloudflare: false, trustedProxyCidrs: [] });
    const request = fakeRequest({ remoteAddress: "not-an-ip" });
    expect(resolveClientIp(request)).toBe("unknown");
  });

  it("ignores CF-Connecting-IP for a public peer without an allowlist", () => {
    configureClientIp({ trustProxyHops: 0, trustCloudflare: true, trustedProxyCidrs: [] });
    const request = fakeRequest({
      remoteAddress: "198.51.100.20",
      headers: { "cf-connecting-ip": "not-an-ip" },
    });
    expect(resolveClientIp(request)).toBe("198.51.100.20");
  });
});
