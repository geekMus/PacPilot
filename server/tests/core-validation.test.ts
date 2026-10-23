import { describe, expect, test } from "bun:test";
import { validatePacProxyString } from "../services/pac-generator";
import { parseRemoteListText } from "../services/remote-list";

describe("validatePacProxyString", () => {
  test("accepts direct and valid proxy endpoints", () => {
    expect(validatePacProxyString("DIRECT")).toBeNull();
    expect(validatePacProxyString("PROXY proxy.example.com:8080")).toBeNull();
    expect(validatePacProxyString("HTTPS proxy.example.com:443; SOCKS5 [2001:db8::1]:1080;")).toBeNull();
    expect(validatePacProxyString("PROXY 192.168.1.2:65535")).toBeNull();
  });

  test("rejects empty entries and malformed instructions", () => {
    expect(validatePacProxyString("")).not.toBeNull();
    expect(validatePacProxyString("PROXY proxy.example.com:8080;;DIRECT")).not.toBeNull();
    expect(validatePacProxyString("UNKNOWN proxy.example.com:8080")).not.toBeNull();
    expect(validatePacProxyString("PROXY proxy.example.com")).not.toBeNull();
  });

  test("rejects invalid ports and IP addresses", () => {
    expect(validatePacProxyString("PROXY proxy.example.com:0")).not.toBeNull();
    expect(validatePacProxyString("PROXY proxy.example.com:65536")).not.toBeNull();
    expect(validatePacProxyString("PROXY 999.1.1.1:8080")).not.toBeNull();
    expect(validatePacProxyString("SOCKS5 [not-ipv6]:1080")).not.toBeNull();
  });
});

describe("parseRemoteListText", () => {
  test("parses plain domains, ignores comments, normalizes and deduplicates", () => {
    const result = parseRemoteListText("# list\nExample.com\nexample.com\n*.Sub.example.org\n// comment\n");
    expect(result.format).toBe("plain-domains");
    expect(result.proxyHosts).toEqual(["example.com", "sub.example.org"]);
    expect(result.directHosts).toEqual([]);
  });

  test("parses AutoProxy rules and lets exceptions override proxy rules", () => {
    const result = parseRemoteListText("||example.com^\n||blocked.example.org^\n@@||example.com^\n");
    expect(result.format).toBe("abp");
    expect(result.proxyHosts).toEqual(["blocked.example.org"]);
    expect(result.directHosts).toEqual(["example.com"]);
  });

  test("rejects empty or unparseable lists", () => {
    expect(() => parseRemoteListText("   ")).toThrow("远程列表内容为空");
    expect(() => parseRemoteListText("this is not a domain list")).toThrow();
  });
});
