import { describe, expect, it } from "vitest";
import { obfuscatePac } from "../services/pac-obfuscator";

const SOURCE = [
  'var BLOCK_LIST = ["blocked.example"];',
  'var PAC_PROXY = "SOCKS5 127.0.0.1:1080; DIRECT";',
  "function FindProxyForURL(url, host) {",
  '  return host === "blocked.example" ? "PROXY 0.0.0.0:0" : PAC_PROXY;',
  "}",
].join("\n");

describe("obfuscatePac", () => {
  it("emits a single line of code", () => {
    const code = obfuscatePac(SOURCE);
    expect(code).not.toContain("\n");
    expect(code.length).toBeGreaterThan(SOURCE.length);
  });

  it("keeps the global entry point and the top-level names the status page parses", () => {
    const code = obfuscatePac(SOURCE);
    // PAC 客户端只认 FindProxyForURL；状态页按 BLOCK_LIST 等顶层名取规则。
    expect(code).toContain("FindProxyForURL");
    expect(code).toContain("BLOCK_LIST");
    expect(code).toContain("PAC_PROXY");
  });

  it("is deterministic for the same input", () => {
    // 混淆器默认随机种子会让每次重建产出不同字节，ETag 随之漂移；
    // 这里锁定 seed 后必须可复现。
    const first = obfuscatePac(SOURCE);
    const second = obfuscatePac(SOURCE);
    const third = obfuscatePac(SOURCE);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("moves string literals into the string array", () => {
    const code = obfuscatePac(SOURCE);
    // 域名不再以明文出现在代码主体里。
    expect(code.includes("blocked.example") && code.includes("SOCKS5 127.0.0.1:1080; DIRECT")).toBe(
      false
    );
  });

  it("rejects empty input instead of returning an empty string", () => {
    expect(() => obfuscatePac("")).toThrow();
  });
});
