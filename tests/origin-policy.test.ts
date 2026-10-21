import { describe, expect, test } from "bun:test";
import { isTrustedOrigin } from "../server/utils/origin-policy";

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

  test("rejects absent and untrusted origins", () => {
    expect(isTrustedOrigin(undefined, "https://admin.example.com", allowlist)).toBe(false);
    expect(
      isTrustedOrigin("https://evil.example", "https://admin.example.com", allowlist)
    ).toBe(false);
  });
});
