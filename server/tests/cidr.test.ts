import { describe, expect, it } from "vitest";
import { isIpInAnyCidr, isIpInCidr, isValidCidr } from "../utils/cidr";

describe("isValidCidr", () => {
  it("accepts IPv4/IPv6 ranges and bare addresses", () => {
    expect(isValidCidr("172.17.0.0/16")).toBe(true);
    expect(isValidCidr("10.0.0.1")).toBe(true);
    expect(isValidCidr("2400:cb00::/32")).toBe(true);
    expect(isValidCidr("::1/128")).toBe(true);
  });

  it("rejects malformed ranges", () => {
    expect(isValidCidr("172.17.0.0/33")).toBe(false);
    expect(isValidCidr("2400:cb00::/129")).toBe(false);
    expect(isValidCidr("300.1.1.1/16")).toBe(false);
    expect(isValidCidr("172.17.0.0/16/8")).toBe(false);
    expect(isValidCidr("not-a-cidr")).toBe(false);
  });
});

describe("isIpInCidr", () => {
  it("matches IPv4 networks", () => {
    expect(isIpInCidr("172.17.0.5", "172.17.0.0/16")).toBe(true);
    expect(isIpInCidr("172.18.0.5", "172.17.0.0/16")).toBe(false);
    expect(isIpInCidr("192.168.1.20", "192.168.0.0/16")).toBe(true);
    expect(isIpInCidr("8.8.8.8", "10.0.0.0/8")).toBe(false);
  });

  it("handles /32, /0 and exact addresses", () => {
    expect(isIpInCidr("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(isIpInCidr("1.2.3.5", "1.2.3.4")).toBe(false);
    expect(isIpInCidr("1.2.3.4", "1.2.3.4/32")).toBe(true);
    expect(isIpInCidr("203.0.113.9", "0.0.0.0/0")).toBe(true);
  });

  it("matches IPv6 networks", () => {
    expect(isIpInCidr("2400:cb00:1::7", "2400:cb00::/32")).toBe(true);
    expect(isIpInCidr("2401:cb00::1", "2400:cb00::/32")).toBe(false);
    expect(isIpInCidr("::1", "::1/128")).toBe(true);
    expect(isIpInCidr("fd00::5", "fd00::/8")).toBe(true);
  });

  it("does not mix address families", () => {
    expect(isIpInCidr("1.2.3.4", "2400:cb00::/32")).toBe(false);
    expect(isIpInCidr("2400:cb00::1", "10.0.0.0/8")).toBe(false);
  });
});

describe("isIpInAnyCidr", () => {
  it("returns true when any range matches", () => {
    const ranges = ["172.17.0.0/16", "2400:cb00::/32"];
    expect(isIpInAnyCidr("172.17.3.4", ranges)).toBe(true);
    expect(isIpInAnyCidr("2400:cb00::9", ranges)).toBe(true);
    expect(isIpInAnyCidr("8.8.8.8", ranges)).toBe(false);
    expect(isIpInAnyCidr("8.8.8.8", [])).toBe(false);
  });
});
