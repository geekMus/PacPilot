import { describe, expect, it } from "vitest";
import { assertSafeHttpUrl, isBlockedHostname, isBlockedIpAddress } from "../../server/utils/url-safety";

describe("isBlockedIpAddress", () => {
  it("blocks private, loopback, link-local, CGNAT and reserved IPv4 ranges", () => {
    for (const ip of [
      "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1",
      "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.255.254", "224.0.0.1",
    ]) expect(isBlockedIpAddress(ip)).toBe(true);
  });

  it("allows public IPv4 and blocks malformed strings only when in a known blocked range", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("172.32.0.1")).toBe(false);
    expect(isBlockedIpAddress("999.1.1.1")).toBe(false);
  });

  it("blocks loopback, unspecified, link-local, unique-local and mapped private IPv6", () => {
    for (const ip of ["::", "::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:192.168.1.1"]) {
      expect(isBlockedIpAddress(ip)).toBe(true);
    }
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks local names and metadata aliases case-insensitively", () => {
    for (const host of ["", "localhost", "LOCALHOST.", "node.local", "x.internal", "foo.localhost",
      "metadata.google.internal", "metadata.goog", "192.168.1.2"]) {
      expect(isBlockedHostname(host)).toBe(true);
    }
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("assertSafeHttpUrl", () => {
  it("accepts public HTTP(S) URLs", () => {
    expect(assertSafeHttpUrl("https://example.com/path", "url")).toBeNull();
    expect(assertSafeHttpUrl("http://8.8.8.8", "url")).toBeNull();
  });

  it("rejects malformed URLs, unsupported schemes and credentials", () => {
    expect(assertSafeHttpUrl("not a URL", "Webhook")).toContain("is invalid");
    expect(assertSafeHttpUrl("file:///etc/passwd", "Webhook")).toContain("HTTP or HTTPS");
    expect(assertSafeHttpUrl("https://user:pass@example.com", "Webhook")).toContain("username or password");
  });

  it("rejects private hosts by default", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "172.20.0.1", "192.168.1.1",
      "169.254.169.254", "metadata.google.internal"]) {
      expect(assertSafeHttpUrl("http://" + host, "rules")).toContain("SSRF protection");
    }
  });

  it("allows LAN webhooks but still rejects loopback and metadata", () => {
    expect(assertSafeHttpUrl("http://192.168.1.10:8080/hook", "Webhook", { allowPrivateHosts: true }))
      .toBeNull();
    expect(assertSafeHttpUrl("http://127.0.0.1", "Webhook", { allowPrivateHosts: true }))
      .toContain("loopback or cloud metadata");
    expect(assertSafeHttpUrl("http://metadata.goog", "Webhook", { allowPrivateHosts: true }))
      .toContain("loopback or cloud metadata");
  });

  it("covers remaining IPv4 reserved ranges and normalized IPv6 forms", () => {
    for (const ip of ["0.1.2.3", "192.0.2.1", "198.51.100.2", "203.0.113.5", "240.0.0.1"]) {
      expect(isBlockedIpAddress(ip)).toBe(ip.startsWith("0.") || ip.startsWith("240."));
    }
    expect(isBlockedIpAddress("[::1]")).toBe(true);
    expect(isBlockedIpAddress("FE80::1")).toBe(true);
    expect(isBlockedIpAddress("FDCF::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
    // URL parsers normalize dotted IPv4-mapped IPv6 to hexadecimal groups;
    // both compressed and fully expanded forms must still honor IPv4 SSRF rules.
    expect(isBlockedIpAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedIpAddress("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(isBlockedIpAddress("[::ffff:ac10:1]")).toBe(true);
    expect(isBlockedIpAddress("::ffff:808:808")).toBe(false);
    expect(assertSafeHttpUrl("http://[::ffff:7f00:1]", "rules")).toContain("SSRF protection");
  });

  it("normalizes local host aliases and validates URL options", () => {
    expect(isBlockedHostname("localhost.localdomain")).toBe(true);
    expect(isBlockedHostname("host.INTERNAL.")).toBe(true);
    expect(isBlockedHostname("   ")).toBe(true);
    expect(assertSafeHttpUrl("https://user@example.com", "rules")).toContain("username or password");
    expect(assertSafeHttpUrl("https://192.168.1.10", "Webhook", { allowPrivateHosts: true })).toBeNull();
    expect(assertSafeHttpUrl("http://169.254.1.1", "Webhook", { allowPrivateHosts: true }))
      .toContain("loopback or cloud metadata");
    expect(assertSafeHttpUrl("http://127.0.0.2", "Webhook", { allowPrivateHosts: true }))
      .toContain("loopback or cloud metadata");
  });

});
