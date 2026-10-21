import { describe, expect, test } from "bun:test";
import { validatePacProxyString } from "../../server/services/pac-generator";

describe("PAC proxy directive validation", () => {
  test.each([
    "PROXY proxy.example.com:8080",
    "HTTPS proxy.example.com:443; DIRECT",
    "SOCKS5 127.0.0.1:1080",
    "SOCKS5 [::1]:1080",
    "DIRECT;",
    "PROXY proxy.example.com:8080; SOCKS5 [2001:db8::1]:1080;",
  ])("accepts valid directive list: %s", (value) => {
    expect(validatePacProxyString(value)).toBeNull();
  });

  test.each([
    ["", "empty input"],
    ["PROXY proxy.example.com", "missing port"],
    ["PROXY proxy.example.com:0", "port zero"],
    ["PROXY proxy.example.com:65536", "port overflow"],
    ["PROXY invalid_host:8080", "underscore in hostname"],
    ["PROXY 999.1.1.1:8080", "invalid IPv4"],
    ["SOCKS5 [not-ipv6]:1080", "invalid IPv6"],
    ["PROXY proxy.example.com:8080;;DIRECT", "empty directive"],
    ["DIRECT; UNKNOWN proxy.example.com:8080", "unsupported directive"],
  ])("rejects %s (%s)", (value) => {
    expect(validatePacProxyString(value)).not.toBeNull();
  });

  test("allows a trailing separator but rejects separators between empty entries", () => {
    expect(validatePacProxyString("PROXY proxy.example.com:8080;")).toBeNull();
    expect(validatePacProxyString("PROXY proxy.example.com:8080;;")).not.toBeNull();
  });
});
