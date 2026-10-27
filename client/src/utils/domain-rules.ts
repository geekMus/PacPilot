import { i18n } from "@/i18n";

function tr(key: string, params?: Record<string, unknown>): string {
  return String(i18n.global.t(key, params ?? {}));
}

type RuleSeverity = "error" | "warning" | "info";
export interface RuleDiagnostic {
  line: number;
  severity: RuleSeverity;
  message: string;
  relatedLine?: number;
}
interface ParsedDomainRule {
  line: number;
  raw: string;
  host: string;
  scope: "exact" | "subdomains" | "both";
}
interface DomainRuleAnalysis {
  diagnostics: RuleDiagnostic[];
  validCount: number;
  errorCount: number;
  warningCount: number;
}
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
function validHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  const normalized = host.endsWith(".") ? host.slice(0, -1) : host;
  if (!normalized) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized))
    return normalized
      .split(".")
      .every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  const labels = normalized.split(".");
  return labels.every((part) => labelPattern.test(part));
}
export function parseDomainRules(raw: string): {
  rules: ParsedDomainRule[];
  diagnostics: RuleDiagnostic[];
} {
  const rules: ParsedDomainRule[] = [];
  const diagnostics: RuleDiagnostic[] = [];
  raw.split(/\r?\n/).forEach((lineText, index) => {
    for (const entryText of lineText.split(",")) {
      const value = entryText.trim();
      if (!value) continue;
      let host = value;
      let scope: ParsedDomainRule["scope"] = "exact";
      if (value.startsWith("**.")) {
        scope = "both";
        host = value.slice(3);
      } else if (value.startsWith("*.")) {
        scope = "subdomains";
        host = value.slice(2);
      }
      if (value.includes("*") && !value.startsWith("*.") && !value.startsWith("**.")) {
        diagnostics.push({
          line: index + 1,
          severity: "error",
          message: tr("domainRuleDiag.unsupportedWildcard"),
        });
        continue;
      }
      if (
        host.includes("*") ||
        !validHost(host) ||
        (scope !== "exact" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))
      ) {
        diagnostics.push({
          line: index + 1,
          severity: "error",
          message: tr("domainRuleDiag.invalidDomain"),
        });
        continue;
      }
      rules.push({
        line: index + 1,
        raw: value,
        host: host.toLowerCase().replace(/\.$/, ""),
        scope,
      });
    }
  });
  return { rules, diagnostics };
}
function covers(a: ParsedDomainRule, b: ParsedDomainRule): boolean {
  if (a.host === b.host) {
    if (a.scope === "both") return true;
    return a.scope === b.scope;
  }
  return b.host.endsWith("." + a.host) && (a.scope === "subdomains" || a.scope === "both");
}
function overlaps(a: ParsedDomainRule, b: ParsedDomainRule): boolean {
  return covers(a, b) || covers(b, a);
}
export function analyzeDomainRules(
  directText: string,
  blockText: string
): {
  direct: DomainRuleAnalysis;
  block: DomainRuleAnalysis;
  totalErrors: number;
  totalWarnings: number;
} {
  const directParsed = parseDomainRules(directText);
  const blockParsed = parseDomainRules(blockText);
  const directDiagnostics = [...directParsed.diagnostics];
  const blockDiagnostics = [...blockParsed.diagnostics];
  function addLocalDiagnostics(
    rules: ParsedDomainRule[],
    diagnostics: RuleDiagnostic[],
    label: string
  ) {
    const seen = new Map<string, ParsedDomainRule>();
    for (const rule of rules) {
      const key = rule.host + "|" + rule.scope;
      const previous = seen.get(key);
      if (previous)
        diagnostics.push({
          line: rule.line,
          severity: "warning",
          relatedLine: previous.line,
          message: tr("domainRuleDiag.duplicateLine", { line: previous.line, label }),
        });
      else seen.set(key, rule);
    }
    for (const rule of rules) {
      const covering = rules.find(
        (other) =>
          other.line !== rule.line &&
          covers(other, rule) &&
          !(other.host === rule.host && other.scope === rule.scope)
      );
      if (covering)
        diagnostics.push({
          line: rule.line,
          severity: "warning",
          relatedLine: covering.line,
          message: tr("domainRuleDiag.coveredByLine", { line: covering.line }),
        });
    }
    const byHost = new Map<string, ParsedDomainRule[]>();
    for (const rule of rules) byHost.set(rule.host, [...(byHost.get(rule.host) ?? []), rule]);
    for (const [host, group] of byHost) {
      const exact = group.find((rule) => rule.scope === "exact");
      const subdomains = group.find((rule) => rule.scope === "subdomains");
      const both = group.find((rule) => rule.scope === "both");
      if (exact && subdomains && !both) {
        diagnostics.push({
          line: exact.line,
          severity: "info",
          relatedLine: subdomains.line,
          message: tr("domainRuleDiag.mergeEquivalent", {
            exact: exact.line,
            subdomains: subdomains.line,
            host,
          }),
        });
        diagnostics.push({
          line: subdomains.line,
          severity: "info",
          relatedLine: exact.line,
          message: tr("domainRuleDiag.mergeWithExact", { line: exact.line, host }),
        });
      }
    }
  }
  addLocalDiagnostics(directParsed.rules, directDiagnostics, tr("domainRuleDiag.directList"));
  addLocalDiagnostics(blockParsed.rules, blockDiagnostics, tr("domainRuleDiag.blockList"));
  for (const direct of directParsed.rules)
    for (const block of blockParsed.rules) {
      if (!overlaps(direct, block)) continue;
      directDiagnostics.push({
        line: direct.line,
        severity: "warning",
        relatedLine: block.line,
        message: tr("domainRuleDiag.overlapBlock", { line: block.line }),
      });
      blockDiagnostics.push({
        line: block.line,
        severity: "warning",
        relatedLine: direct.line,
        message: tr("domainRuleDiag.overlapDirect", { line: direct.line }),
      });
    }
  const count = (items: RuleDiagnostic[], severity: RuleSeverity) =>
    items.filter((item) => item.severity === severity).length;
  const direct = {
    diagnostics: directDiagnostics,
    validCount: directParsed.rules.length,
    errorCount: count(directDiagnostics, "error"),
    warningCount: count(directDiagnostics, "warning"),
  };
  const block = {
    diagnostics: blockDiagnostics,
    validCount: blockParsed.rules.length,
    errorCount: count(blockDiagnostics, "error"),
    warningCount: count(blockDiagnostics, "warning"),
  };
  return {
    direct,
    block,
    totalErrors: direct.errorCount + block.errorCount,
    totalWarnings: direct.warningCount + block.warningCount,
  };
}
