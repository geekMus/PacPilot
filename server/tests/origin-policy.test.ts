import { describe, expect, it } from "vitest";
import {
  getLocalInterfaceAddresses,
  isTrustedOrigin,
  normalizeOrigin,
} from "../utils/origin-policy";

describe("normalizeOrigin", () => {
  it("normalizes valid HTTP origins and removes path and query", () => {
    expect(normalizeOrigin("https://example.com:8443/path?q=1")).toBe("https://example.com:8443");
    expect(normalizeOrigin("http://example.com")).toBe("http://example.com");
  });

  it("rejects missing, invalid and non-HTTP origins", () => {
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("not an origin")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("data:text/plain,hi")).toBeNull();
  });
});

describe("getLocalInterfaceAddresses", () => {
  it("always includes loopback addresses and returns normalized IP literals", () => {
    const addresses = getLocalInterfaceAddresses();
    expect(addresses.has("127.0.0.1")).toBe(true);
    expect(addresses.has("::1")).toBe(true);
    for (const address of addresses) {
      expect(address.includes("%")).toBe(false);
    }
  });
});

describe("isTrustedOrigin", () => {
  const localAddresses = new Set(["127.0.0.1", "::1", "192.168.31.133"]);

  it("accepts matching request origin and explicitly allowed origins", () => {
    expect(isTrustedOrigin("https://example.com/path", "https://example.com/api", new Set())).toBe(true);
    expect(
      isTrustedOrigin(
        "https://trusted.example",
        "https://other.example",
        new Set(["https://trusted.example"]),
        localAddresses
      )
    ).toBe(true);
  });

  it("accepts a discovered local interface IP on the service port or Vite port", () => {
    expect(
      isTrustedOrigin("http://192.168.31.133:5173", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(true);
    expect(
      isTrustedOrigin("http://192.168.31.133:17321", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(true);
    expect(
      isTrustedOrigin("http://localhost:5173", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(true);
  });

  it("does not trust another host or arbitrary ports on a local interface", () => {
    expect(
      isTrustedOrigin("http://192.168.31.200:5173", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(false);
    expect(
      isTrustedOrigin("http://192.168.31.133:9000", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(false);
    expect(
      isTrustedOrigin("http://localhost:9000", "http://127.0.0.1:17321", new Set(), localAddresses)
    ).toBe(false);
    expect(
      isTrustedOrigin("https://attacker.example", "https://example.com", new Set(), localAddresses)
    ).toBe(false);
  });

  it("rejects absent, malformed and untrusted origins", () => {
    expect(isTrustedOrigin(undefined, "https://example.com", new Set(), localAddresses)).toBe(false);
    expect(isTrustedOrigin("bad", "https://example.com", new Set(), localAddresses)).toBe(false);
    expect(
      isTrustedOrigin("https://attacker.example", "https://example.com", new Set(), localAddresses)
    ).toBe(false);
  });
});
