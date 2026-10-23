/** Match a hostname against the PAC custom-rule wildcard semantics. */
export function matchesCustomRule(host: string, rule: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const pattern = rule.trim().toLowerCase().replace(/\.$/, "");
  if (!pattern) return false;

  // *.example.com matches subdomains only; **.example.com also matches the root.
  if (pattern.startsWith("**.")) {
    const root = pattern.slice(3);
    return normalizedHost === root || normalizedHost.endsWith("." + root);
  }
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return normalizedHost.length > suffix.length + 1 && normalizedHost.endsWith("." + suffix);
  }
  if (pattern.includes("*")) return false;
  return normalizedHost === pattern;
}

export function matchesRemoteDomain(host: string, rule: string): boolean {
  const domain = rule.toLowerCase().trim();
  return Boolean(domain) && (host === domain || host.endsWith("." + domain));
}
