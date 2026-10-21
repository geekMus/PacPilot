import { describe, expect, it } from "vitest";
import { isTrustedOrigin, normalizeOrigin } from "../../server/utils/origin-policy";

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

describe("isTrustedOrigin", () => {
  it("accepts matching request origin and explicitly allowed origins", () => {
    expect(isTrustedOrigin("https://example.com/path", "https://example.com/api", new Set())).toBe(true);
    expect(isTrustedOrigin("https://trusted.example", "https://other.example", new Set(["https://trusted.example"])))
      .toBe(true);
  });

  it("rejects absent, malformed and untrusted origins", () => {
    expect(isTrustedOrigin(undefined, "https://example.com", new Set())).toBe(false);
    expect(isTrustedOrigin("bad", "https://example.com", new Set())).toBe(false);
    expect(isTrustedOrigin("https://attacker.example", "https://example.com", new Set())).toBe(false);
  });
});
