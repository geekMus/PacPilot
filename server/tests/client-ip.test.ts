import { beforeEach, describe, expect, it } from "vitest";
import type { Request } from "express";
import { configureClientIp, isPrivateAddress, normalizeIp, resolveClientIp } from "../utils/client-ip";

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
});

describe("resolveClientIp", () => {
  beforeEach(() => {
    configureClientIp({ trustProxyHops: 1, trustCloudflare: false });
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
    configureClientIp({ trustCloudflare: true, trustProxyHops: 0 });
    const request = fakeRequest({
      remoteAddress: "198.51.100.20",
      headers: { "cf-connecting-ip": "203.0.113.99" },
    });
    expect(resolveClientIp(request)).toBe("198.51.100.20");
  });
});
