import { describe, expect, test } from "bun:test";
import { assertSafeHttpUrl, isBlockedHostname, isBlockedIpAddress } from "../../server/utils/url-safety";

describe("backend URL safety / SSRF policy", () => {
  test.each([
    ["127.0.0.1", true],
    ["10.2.3.4", true],
    ["172.16.0.1", true],
    ["172.31.255.254", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["8.8.8.8", false],
    ["172.32.0.1", false],
    ["203.0.113.10", false],
  ])("classifies IPv4 address %s as blocked=%s", (host, blocked) => {
    expect(isBlockedIpAddress(host)).toBe(blocked);
  });

  test.each([
    ["localhost", true],
    ["api.localhost", true],
    ["router.local", true],
    ["metadata.google.internal", true],
    ["example.com", false],
    ["sub.example.com", false],
  ])("classifies hostname %s as blocked=%s", (host, blocked) => {
    expect(isBlockedHostname(host)).toBe(blocked);
  });

  test("requires absolute HTTP(S) URLs and rejects credentials", () => {
    expect(assertSafeHttpUrl("example.com/rules", "rules")).toContain("invalid");
    expect(assertSafeHttpUrl("file:///etc/passwd", "rules")).toContain("HTTP");
    expect(assertSafeHttpUrl("https://user:pass@example.com/rules", "rules")).toContain("username");
    expect(assertSafeHttpUrl("https://example.com/rules", "rules")).toBeNull();
  });

  test("blocks private, loopback and metadata destinations for remote fetches", () => {
    for (const url of [
      "http://127.0.0.1/rules",
      "http://192.168.1.1/rules",
      "http://169.254.169.254/latest/meta-data",
      "http://service.internal/rules",
    ]) {
      expect(assertSafeHttpUrl(url, "rules")).not.toBeNull();
    }
  });

  test("allows intentional LAN webhooks but never loopback or metadata", () => {
    expect(assertSafeHttpUrl("http://192.168.1.20:8080/hook", "webhook", { allowPrivateHosts: true })).toBeNull();
    expect(assertSafeHttpUrl("http://10.0.0.4/hook", "webhook", { allowPrivateHosts: true })).toBeNull();
    expect(assertSafeHttpUrl("http://127.0.0.1/hook", "webhook", { allowPrivateHosts: true })).toContain("loopback");
    expect(assertSafeHttpUrl("http://169.254.169.254/latest", "webhook", { allowPrivateHosts: true })).toContain("loopback");
  });
});
