import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRemoteListPac,
  fetchAndParseRemoteList,
  parseRemoteListText,
} from "../../server/services/remote-list";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseRemoteListText", () => {
  it("rejects empty input and lists without usable domains", () => {
    expect(() => parseRemoteListText("  \n ")).toThrow("远程列表内容为空");
    expect(() => parseRemoteListText("# only comments\n! comment\nnot a URL/path"))
      .toThrow("未能从远程列表解析出有效域名");
  });

  it("parses and normalizes plain domain lists while ignoring comments and duplicates", () => {
    const result = parseRemoteListText(
      "# header\n// comment\nExample.com\n*.Sub.example.com\n.example.net\nexample.com"
    );
    expect(result.format).toBe("plain-domains");
    expect(result.proxyHosts).toEqual(["example.com", "example.net", "sub.example.com"]);
    expect(result.directHosts).toEqual([]);
    expect(result.rawLineCount).toBe(4);
  });

  it("parses AutoProxy rules and lets exceptions override proxy entries", () => {
    const result = parseRemoteListText(
      "||example.com^\n||sub.example.com^\n@@||example.com^\n|https://plain.example.org/path\n||*.wild.example.com^\n||.dot.example.net^\n||port.example.org:8080/path?x=1^\n||bad*host^\n! comment\n[AutoProxy 0.2.9]"
    );
    expect(result.format).toBe("abp");
    expect(result.proxyHosts).toEqual(["dot.example.net", "plain.example.org", "port.example.org", "sub.example.com", "wild.example.com"]);
    expect(result.directHosts).toEqual(["example.com"]);
  });

  it("parses a base64-encoded GFWList and rejects unusable base64 content", () => {
    const encoded = Buffer.from("||proxy.example.com^\n@@||direct.example.com^", "utf8").toString("base64");
    const result = parseRemoteListText(encoded);
    expect(result.format).toBe("gfwlist-base64");
    expect(result.proxyHosts).toEqual(["proxy.example.com"]);
    expect(result.directHosts).toEqual(["direct.example.com"]);
    expect(() => parseRemoteListText(Buffer.from("! no domains", "utf8").toString("base64")))
      .toThrow("Base64 解码后没有有效域名");
  });

  it("generates PAC with user rules, remote exceptions, proxy hosts and escaped values", () => {
    const pac = buildRemoteListPac(
      "PROXY proxy.example.com:8080",
      ["proxy.example.com", 'quote"host.example'],
      ["direct.example.com"],
      ["blocked.example.com"],
      ["**.internal.example.com"],
      false
    );
    expect(pac).toContain('var PROXY = "PROXY proxy.example.com:8080"');
    expect(pac).toContain('"quote\\"host.example":1');
    expect(pac).toContain("var USER_BLOCK");
    expect(pac).toContain("var USER_DIRECT");
    expect(pac).toContain("function FindProxyForURL");
    const compressed = buildRemoteListPac("DIRECT", ["example.com"], [], [], [], true);
    expect(compressed).toContain('"example.com":1');
    expect(compressed).not.toContain(",\\n  ");
  });

  it("rejects unsafe URLs before making an outbound request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAndParseRemoteList("http://127.0.0.1/rules")).rejects.toThrow("SSRF protection");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches, parses and returns bounded response metadata", async () => {
    const longHeader = "x".repeat(600);
    const fetchMock = vi.fn().mockResolvedValue(new Response("example.com\nsub.example.com", {
      status: 200,
      headers: { "content-type": "text/plain", "x-large": longHeader },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchAndParseRemoteList("https://rules.example.com/list.txt");
    expect(result.proxyHosts).toEqual(["example.com", "sub.example.com"]);
    expect(result.fetch?.status).toBe(200);
    expect(result.fetch?.attempts).toBe(1);
    expect(result.fetch?.method).toBe("GET");
    expect(result.fetch?.response_headers["x-large"]).toHaveLength(512);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry HTTP errors or deterministic parse errors", async () => {
    const httpFetch = vi.fn().mockResolvedValue(new Response("nope", { status: 503, statusText: "Unavailable" }));
    vi.stubGlobal("fetch", httpFetch);
    await expect(fetchAndParseRemoteList("https://rules.example.com/list.txt")).rejects.toThrow("HTTP 503");
    expect(httpFetch).toHaveBeenCalledOnce();

    const parseFetch = vi.fn().mockResolvedValue(new Response("# empty", { status: 200 }));
    vi.stubGlobal("fetch", parseFetch);
    await expect(fetchAndParseRemoteList("https://rules.example.com/list.txt"))
      .rejects.toThrow("未能从远程列表解析出有效域名");
    expect(parseFetch).toHaveBeenCalledOnce();
  });

  it("retries transient fetch errors and reports the final failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    await expect(fetchAndParseRemoteList("https://rules.example.com/list.txt"))
      .rejects.toThrow("已重试 2 次");
  });
});
