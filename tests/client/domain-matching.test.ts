import { describe, expect, it } from "vitest";
import { matchesCustomRule, matchesRemoteDomain } from "../../client/src/utils/domain-matching";

describe("matchesCustomRule", () => {
  it("normalizes case and trailing dots for exact rules", () => {
    expect(matchesCustomRule("EXAMPLE.COM.", " example.com. ")).toBe(true);
    expect(matchesCustomRule("sub.example.com", "example.com")).toBe(false);
  });

  it("lets double wildcards match both the root and subdomains", () => {
    expect(matchesCustomRule("example.com", "**.example.com")).toBe(true);
    expect(matchesCustomRule("api.example.com", "**.example.com")).toBe(true);
    expect(matchesCustomRule("example.org", "**.example.com")).toBe(false);
  });

  it("lets single wildcards match subdomains but not the root", () => {
    expect(matchesCustomRule("api.example.com", "*.example.com")).toBe(true);
    expect(matchesCustomRule("example.com", "*.example.com")).toBe(false);
    expect(matchesCustomRule("badexample.com", "*.example.com")).toBe(false);
  });

  it("rejects empty rules and unsupported wildcard patterns", () => {
    expect(matchesCustomRule("example.com", " ")).toBe(false);
    expect(matchesCustomRule("bad.example.com", "bad*.example.com")).toBe(false);
  });
});

describe("matchesRemoteDomain", () => {
  it("matches a remote domain and its subdomains only", () => {
    expect(matchesRemoteDomain("example.com", "example.com")).toBe(true);
    expect(matchesRemoteDomain("api.example.com", "example.com")).toBe(true);
    expect(matchesRemoteDomain("badexample.com", "example.com")).toBe(false);
    expect(matchesRemoteDomain("example.org", "")).toBe(false);
  });
});
