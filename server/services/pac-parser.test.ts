import { describe, expect, it } from "bun:test";
import { parsePacStatus } from "./pac-parser";

describe("parsePacStatus", () => {
  it("recognizes the current custom template without old comment text", () => {
    const pac = \`var BLOCK_LIST = ["ads.example.com"];
var DIRECT_LIST = ["intranet.example.com"];
var PAC_PROXY = "SOCKS5 127.0.0.1:1080; DIRECT";\`;
    const result = parsePacStatus(pac, "Asia/Shanghai", new Date("2026-10-18T10:00:00Z"));
    expect(result.mode).toBe("custom");
    expect(result.blockList).toEqual(["ads.example.com"]);
    expect(result.directList).toEqual(["intranet.example.com"]);
    expect(result.pacProxy).toBe("SOCKS5 127.0.0.1:1080; DIRECT");
  });

  it("recognizes remote mode and includes user rule arrays and remote counts", () => {
    const pac = \`var PROXY = "SOCKS5 127.0.0.1:1080; DIRECT";
var USER_BLOCK = ["ads.example.com", "*.track.example"];
var USER_DIRECT = ["office.example.com"];
var proxyHosts = {"video.example":1,"music.example":1};
var remoteDirect = {"docs.example":1};\`;
    const result = parsePacStatus(pac, "Asia/Shanghai", new Date("2026-10-18T10:00:00Z"));
    expect(result.mode).toBe("remote");
    expect(result.blockList).toEqual(["ads.example.com", "*.track.example"]);
    expect(result.directList).toEqual(["office.example.com"]);
    expect(result.remoteProxyCount).toBe(2);
    expect(result.remoteDirectCount).toBe(1);
    expect(result.pacProxy).toBe("SOCKS5 127.0.0.1:1080; DIRECT");
  });

  it("reports a missing PAC clearly", () => {
    const result = parsePacStatus("");
    expect(result.mode).toBe("empty");
    expect(result.hasPac).toBe(false);
  });

  it("does not label an unrelated PAC as a built-in remote template", () => {
    expect(parsePacStatus("function FindProxyForURL(url, host) { return 'DIRECT'; }").mode).toBe("other");
  });
});
