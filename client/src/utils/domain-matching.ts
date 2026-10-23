/** 按 PAC 自定义规则的通配符语义匹配主机名。 */
export function matchesCustomRule(host: string, rule: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const pattern = rule.trim().toLowerCase().replace(/\.$/, "");
  if (!pattern) return false;

  // *.example.com 只匹配子域名；**.example.com 同时匹配根域名和子域名。
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
