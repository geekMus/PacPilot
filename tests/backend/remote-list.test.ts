import { describe, expect, test } from "bun:test";
import { buildRemoteListPac, parseRemoteListText } from "../../server/services/remote-list";

describe("remote rule-list parsing and PAC generation", () => {
  test("parses plain domain lists case-insensitively and de-duplicates entries", () => {
    const parsed = parseRemoteListText("# generated list\nExample.com\nexample.com\n*.Ads.example\n// comment\ninvalid domain");
    expect(parsed.format).toBe("plain-domains");
    expect(parsed.proxyHosts).toEqual(["ads.example", "example.com"]);
    expect(parsed.directHosts).toEqual([]);
    expect(parsed.rawLineCount).toBe(3);
  });

  test("parses AutoProxy rules and lets exceptions override proxy entries", () => {
    const parsed = parseRemoteListText([
      "! comment",
      "[AutoProxy 0.2.9]",
      "||ads.example^",
      "||cdn.example/path",
      "@@||ads.example^",
      "@@||direct.example^",
    ].join("\n"));
    expect(parsed.format).toBe("abp");
    expect(parsed.proxyHosts).toEqual(["cdn.example"]);
    expect(parsed.directHosts).toEqual(["ads.example", "direct.example"]);
  });

  test("recognizes Base64-encoded GFWList content", () => {
    const encoded = Buffer.from("||ads.example^\n||cdn.example^\n", "utf8").toString("base64");
    const parsed = parseRemoteListText(encoded);
    expect(parsed.format).toBe("gfwlist-base64");
    expect(parsed.proxyHosts).toEqual(["ads.example", "cdn.example"]);
  });

  test("rejects empty and unparseable remote lists with actionable errors", () => {
    expect(() => parseRemoteListText("  \n ")).toThrow("远程列表内容为空");
    expect(() => parseRemoteListText("not a domain list !!!")).toThrow("未能从远程列表解析出有效域名");
  });

  test("generates PAC with user block/direct rules and remote exceptions represented separately", () => {
    const pac = buildRemoteListPac(
      "PROXY 127.0.0.1:7890",
      ["proxy.example"],
      ["direct.example"],
      ["**.blocked.example"],
      ["*.trusted.example"],
      false
    );
    expect(pac).toContain('"proxy.example":1');
    expect(pac).toContain('"direct.example":1');
    expect(pac).toContain('"**.blocked.example"');
    expect(pac).toContain('"*.trusted.example"');
    expect(pac.indexOf("USER_BLOCK.length && isMatch")).toBeLessThan(
      pac.indexOf("USER_DIRECT.length && isMatch")
    );
  });
});
