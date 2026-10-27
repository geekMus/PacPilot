import { describe, expect, it } from "vitest";
import { parsePacStatus } from "../services/pac-parser";

describe("parsePacStatus", () => {
  it("reports an empty payload when there is no PAC", () => {
    for (const pac of ["", "   ", "\n\t "]) {
      expect(parsePacStatus(pac)).toMatchObject({
        mode: "empty",
        hasPac: false,
        blockList: [],
        directList: [],
        pacProxy: null,
        remoteProxyCount: 0,
        remoteDirectCount: 0,
        updatedAt: "",
        timeZone: "Asia/Shanghai",
      });
    }
  });

  it("carries the time zone and generation timestamp", () => {
    const generatedAt = new Date("2026-10-25T01:00:00.000Z");
    const status = parsePacStatus("", "Europe/Berlin", generatedAt);
    expect(status.timeZone).toBe("Europe/Berlin");
    expect(status.updatedAt).toBe("2026-10-25T01:00:00.000Z");
  });

  it("parses the custom template", () => {
    const pac = [
      'var PAC_PROXY = "SOCKS5 127.0.0.1:1080; DIRECT";',
      'var BLOCK_LIST = ["a.example", "b.example"];',
      'var DIRECT_LIST = ["c.example"];',
      "function FindProxyForURL(url, host) { return PAC_PROXY; }",
    ].join("\n");
    expect(parsePacStatus(pac)).toMatchObject({
      mode: "custom",
      hasPac: true,
      blockList: ["a.example", "b.example"],
      directList: ["c.example"],
      pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
    });
  });

  it("parses the remote template with user rules merged in", () => {
    const pac = [
      'var PROXY = "SOCKS5 127.0.0.1:1080; DIRECT";',
      'var USER_BLOCK = ["custom.example"];',
      'var USER_DIRECT = ["lan.example"];',
      'var proxyHosts = {"a.example":1,"b.example":1};',
      'var remoteDirect = {"c.example":1};',
      "function FindProxyForURL(url, host) { return PROXY; }",
    ].join("\n");
    expect(parsePacStatus(pac)).toMatchObject({
      mode: "remote",
      hasPac: true,
      blockList: ["custom.example"],
      directList: ["lan.example"],
      pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
      remoteProxyList: ["a.example", "b.example"],
      remoteDirectList: ["c.example"],
      remoteProxyCount: 2,
      remoteDirectCount: 1,
    });
  });

  it("detects the remote template from any of its markers", () => {
    const byMap = 'var proxyHosts = {"a.example":1};';
    const byUserBlock = "var USER_BLOCK = [];";
    for (const marker of [byMap, byUserBlock]) {
      expect(parsePacStatus(marker).mode).toBe("custom_parse_error");
    }
  });

  it("detects the custom template from any of its markers", () => {
    for (const marker of [
      "var BLOCK_LIST = [];",
      "var DIRECT_LIST = [];",
      'var PAC_PROXY = "DIRECT";',
    ]) {
      expect(parsePacStatus(marker).mode).toBe("custom_parse_error");
    }
  });

  it("reports an unrelated PAC as other", () => {
    const status = parsePacStatus("function FindProxyForURL(){return 'DIRECT';}");
    expect(status).toMatchObject({ mode: "other", hasPac: true, blockList: [], directList: [] });
  });

  it("tolerates the Terser output that merges var declarations", () => {
    // The first declaration keeps the `var` keyword, the rest become comma continuations.
    const pac =
      'var BLOCK_LIST=["a.example"],DIRECT_LIST=["b.example"],PAC_PROXY="DIRECT";function f(){}';
    expect(parsePacStatus(pac)).toMatchObject({
      mode: "custom",
      blockList: ["a.example"],
      directList: ["b.example"],
      pacProxy: "DIRECT",
    });
  });

  it("parses JSON escapes in double-quoted strings", () => {
    const pac = 'var BLOCK_LIST = [];var DIRECT_LIST = [];var PAC_PROXY = "it\'s \\"DIRECT\\"";';
    expect(parsePacStatus(pac).pacProxy).toBe(`it's "DIRECT"`);
  });

  it("de-duplicates map keys", () => {
    const pac = [
      "var proxyHosts = {",
      '"a.example":1,',
      '"a.example":1,',
      '"b.example":1',
      "};",
      "var USER_BLOCK = [];",
      "var USER_DIRECT = [];",
      "var remoteDirect = {};",
      'var PROXY = "DIRECT";',
    ].join("\n");
    expect(parsePacStatus(pac).remoteProxyList).toEqual(["a.example", "b.example"]);
    expect(parsePacStatus(pac).remoteDirectList).toEqual([]);
  });

  it("reports a parse error when a required initializer is missing", () => {
    // BLOCK_LIST present (so the custom marker matches) but DIRECT_LIST is absent.
    const pac = 'var BLOCK_LIST = ["a.example"];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(pac).mode).toBe("custom_parse_error");
  });

  it("reports a parse error for a malformed array body", () => {
    const pac = 'var BLOCK_LIST = ["a.example", ];var DIRECT_LIST = [];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(pac).mode).toBe("custom");
    const trailingGarbage =
      'var BLOCK_LIST = ["a.example" garbage];var DIRECT_LIST = [];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(trailingGarbage).mode).toBe("custom_parse_error");
  });

  it("reports a parse error for unbalanced brackets", () => {
    const pac = 'var BLOCK_LIST = ["a.example";var DIRECT_LIST = [];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(pac).mode).toBe("custom_parse_error");
  });

  it("reports a parse error when a string literal is not valid JSON", () => {
    const pac = "var BLOCK_LIST = [];var DIRECT_LIST = [];var PAC_PROXY = not-a-string;";
    // Unquoted initializer: readInitializer returns the raw token, JSON.parse fails.
    expect(parsePacStatus(pac).mode).toBe("custom_parse_error");
  });

  it("reports a parse error for single-quoted strings outside the generation contract", () => {
    const pac = "var BLOCK_LIST = [];var DIRECT_LIST = [];var PAC_PROXY = 'DIRECT';";
    expect(parsePacStatus(pac).mode).toBe("custom_parse_error");
  });

  it("escapes quotes inside array literals", () => {
    const pac =
      'var BLOCK_LIST = ["a.example", "b.example"];var DIRECT_LIST = [];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(pac).blockList).toEqual(["a.example", "b.example"]);
  });

  it("returns the payload for an empty array", () => {
    const pac = 'var BLOCK_LIST = [];var DIRECT_LIST = [];var PAC_PROXY = "DIRECT";';
    expect(parsePacStatus(pac)).toMatchObject({
      mode: "custom",
      blockList: [],
      directList: [],
      pacProxy: "DIRECT",
    });
  });
});
