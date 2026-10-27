import { describe, expect, it } from "vitest";
import { analyzeDomainRules, parseDomainRules } from "../src/utils/domain-rules";

describe("parseDomainRules", () => {
  it("parses exact, subdomain and combined wildcard rules", () => {
    expect(parseDomainRules("example.com, *.sub.example.com\n**.both.example.org").rules).toEqual([
      { line: 1, raw: "example.com", host: "example.com", scope: "exact" },
      { line: 1, raw: "*.sub.example.com", host: "sub.example.com", scope: "subdomains" },
      { line: 2, raw: "**.both.example.org", host: "both.example.org", scope: "both" },
    ]);
  });

  it("normalizes case and trailing dots, and ignores empty entries", () => {
    const result = parseDomainRules(" EXAMPLE.COM. , , *.Sub.Example.COM. ");
    expect(result.rules.map((rule) => rule.host)).toEqual(["example.com", "sub.example.com"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports unsupported wildcards and invalid hosts with line numbers", () => {
    const result = parseDomainRules("bad*host.example\n*.192.168.1.1\n-invalid.example");
    expect(result.rules).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics.every((item) => item.severity === "error")).toBe(true);
    expect(result.diagnostics.map((item) => item.line)).toEqual([1, 2, 3]);
  });

  it("accepts valid IPv4 but rejects malformed and overlong hosts", () => {
    expect(parseDomainRules("192.168.1.1").rules).toHaveLength(1);
    expect(parseDomainRules("999.1.1.1").diagnostics).toHaveLength(1);
    expect(parseDomainRules("a".repeat(254) + ".com").diagnostics).toHaveLength(1);
  });
});

describe("analyzeDomainRules", () => {
  it("reports duplicate rules and rules covered by a broader wildcard", () => {
    const result = analyzeDomainRules(
      "example.com\nexample.com\n*.example.com\napi.example.com",
      ""
    );
    expect(result.direct.warningCount).toBeGreaterThanOrEqual(2);
    expect(result.direct.diagnostics.some((item) => item.relatedLine === 1)).toBe(true);
  });

  it("reports equivalent exact and subdomain rules", () => {
    const result = analyzeDomainRules("example.com\n*.example.com", "");
    expect(result.direct.diagnostics.some((item) => item.severity === "info")).toBe(true);
  });

  it("reports cross-list overlaps in both lists", () => {
    const result = analyzeDomainRules("*.example.com", "api.example.com");
    expect(result.totalWarnings).toBe(2);
    expect(result.direct.diagnostics[0]?.relatedLine).toBe(1);
    expect(result.block.diagnostics[0]?.relatedLine).toBe(1);
  });

  it("counts invalid rules and handles empty lists", () => {
    expect(analyzeDomainRules("", "").totalErrors).toBe(0);
    const result = analyzeDomainRules("bad*host", "");
    expect(result.totalErrors).toBe(1);
    expect(result.direct.validCount).toBe(0);
  });
});
