import { describe, expect, test } from "bun:test";
import { parsePacProxy, parseProxyTestUrl, ProxyProbeError } from "../server/services/proxy-probe-parser";

describe("proxy probe parsing", () => {
  test("requires an HTTPS target without credentials or fragments", () => {
    expect(parseProxyTestUrl("https://example.com/check?x=1").hostname).toBe("example.com");
    expect(() => parseProxyTestUrl("http://example.com")).toThrow(ProxyProbeError);
    expect(() => parseProxyTestUrl("https://user:pass@example.com")).toThrow(ProxyProbeError);
    expect(() => parseProxyTestUrl("https://example.com/#fragment")).toThrow(ProxyProbeError);
  });

  test("ignores DIRECT entries and de-duplicates proxy endpoints", () => {
    const parsed = parsePacProxy("DIRECT; PROXY 127.0.0.1:7890; PROXY 127.0.0.1:7890; SOCKS5 [::1]:1080");
    expect(parsed.ignoredDirectEntries).toBe(1);
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]).toMatchObject({ kind: "PROXY", host: "127.0.0.1", port: 7890 });
    expect(parsed.candidates[1]).toMatchObject({ kind: "SOCKS5", host: "::1", port: 1080 });
    expect(parsed.warnings).toHaveLength(0);
  });

  test("reports malformed entries instead of silently treating them as proxies", () => {
    const parsed = parsePacProxy("PROXY missing-port; UNKNOWN 127.0.0.1:8080");
    expect(parsed.candidates).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(1);
    expect(() => {
      const result = parsePacProxy("DIRECT");
      if (result.candidates.length === 0 && result.warnings.length === 0) {
        throw new Error("only direct entries are not probeable");
      }
    }).not.toThrow();
  });

  test("rejects empty input with a stable diagnostic", () => {
    expect(parsePacProxy("").warnings[0]?.code).toBe("monitor.probeErrors.proxyStringEmpty");
  });
});
