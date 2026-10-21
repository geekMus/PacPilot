import { describe, expect, test } from "bun:test";
import { isTrustedOrigin, normalizeOrigin } from "../server/utils/origin-policy";

describe("admin origin policy", () => {
  const allowlist = new Set(["https://ops.example.com"]);

  test("allows same-origin requests", () => {
    expect(
      isTrustedOrigin("https://admin.example.com", "https://admin.example.com", allowlist)
    ).toBe(true);
  });

  test("allows explicitly configured origins", () => {
    expect(
      isTrustedOrigin("https://ops.example.com", "https://admin.example.com", allowlist)
    ).toBe(true);
  });

  test("normalizes default ports and trailing paths to an origin", () => {
    expect(normalizeOrigin("https://ops.example.com:443/")).toBe("https://ops.example.com");
    expect(
      isTrustedOrigin("https://ops.example.com:443/", "https://admin.example.com", allowlist)
    ).toBe(true);
    expect(normalizeOrigin("null")).toBeNull();
  });

  test("rejects absent and untrusted origins", () => {
    expect(isTrustedOrigin(undefined, "https://admin.example.com", allowlist)).toBe(false);
    expect(
      isTrustedOrigin("https://evil.example", "https://admin.example.com", allowlist)
    ).toBe(false);
  });
});
