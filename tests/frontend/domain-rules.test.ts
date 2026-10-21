import { describe, expect, test } from "bun:test";
import { analyzeDomainRules, parseDomainRules } from "../../client/src/utils/domain-rules";

describe("frontend domain-rule parser and analyzer", () => {
  test("parses comma- and newline-separated rules with line provenance", () => {
    const parsed = parseDomainRules("Example.com, *.Sub.Example.com\r\n**.internal.example");
    expect(parsed.rules).toEqual([
      { line: 1, raw: "Example.com", host: "example.com", scope: "exact" },
      { line: 1, raw: "*.Sub.Example.com", host: "sub.example.com", scope: "subdomains" },
      { line: 2, raw: "**.internal.example", host: "internal.example", scope: "both" },
    ]);
    expect(parsed.diagnostics).toEqual([]);
  });

  test("reports unsupported wildcard placement and invalid host labels", () => {
    const parsed = parseDomainRules("foo.*.example.com\n-invalid.example\n256.1.1.1\n*.127.0.0.1");
    expect(parsed.rules).toHaveLength(0);
    expect(parsed.diagnostics).toHaveLength(4);
    expect(parsed.diagnostics.every((item) => item.severity === "error")).toBe(true);
    expect(parsed.diagnostics.map((item) => item.line)).toEqual([1, 2, 3, 4]);
  });

  test("detects duplicate and covered rules with source line references", () => {
    const analysis = analyzeDomainRules(
      "example.com\nexample.com\n*.example.com\n**.example.com",
      ""
    );
    expect(analysis.direct.validCount).toBe(4);
    expect(analysis.direct.diagnostics.some((item) => item.severity === "warning" && item.relatedLine === 1)).toBe(true);
    expect(analysis.direct.diagnostics.some((item) => item.message.includes("domainRuleDiag.coveredByLine"))).toBe(false);
    expect(analysis.totalErrors).toBe(0);
  });

  test("reports direct/block overlaps symmetrically", () => {
    const analysis = analyzeDomainRules("**.example.com", "*.example.com");
    expect(analysis.direct.diagnostics.some((item) => item.message.includes("domainRuleDiag.overlapBlock"))).toBe(true);
    expect(analysis.block.diagnostics.some((item) => item.message.includes("domainRuleDiag.overlapDirect"))).toBe(true);
    expect(analysis.totalWarnings).toBeGreaterThanOrEqual(2);
  });

  test("empty lines and trailing separators do not create phantom rules", () => {
    const parsed = parseDomainRules("\nexample.com,,\n\n");
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]).toMatchObject({ host: "example.com", line: 2 });
    expect(parsed.diagnostics).toEqual([]);
  });
});
