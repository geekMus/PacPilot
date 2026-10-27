import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../shared/contracts";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";
import {
  generatePac,
  getRenderedPacBody,
  probePacPilot,
  refreshRemoteRules,
  validatePacProxyString,
  warmPacCache,
} from "../services/pac-generator";
import { invalidateRenderedPac, readRuleSource, writeRuleSource } from "../services/pac-runtime";

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    blockList: ["blocked.example"],
    directList: ["direct.example"],
    ...overrides,
  };
}

async function storageWith(overrides: Partial<AppSettings> = {}) {
  const storage = await createMemoryApplicationStorage();
  await storage.settings.set(settings(overrides));
  return storage;
}

function jsonFetch(payload: string, init: { status?: number } = {}) {
  return vi.fn(async () => new Response(payload, { status: init.status ?? 200 }));
}

beforeEach(() => {
  invalidateRenderedPac();
});

afterEach(() => {
  invalidateRenderedPac();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validatePacProxyString", () => {
  it("rejects an empty value", () => {
    expect(validatePacProxyString("")).toBe("请填写 PAC 代理字符串。");
    expect(validatePacProxyString("   ")).toBe("请填写 PAC 代理字符串。");
  });

  it("accepts DIRECT and supported proxy directives", () => {
    expect(validatePacProxyString("DIRECT")).toBeNull();
    expect(validatePacProxyString("PROXY 127.0.0.1:1080")).toBeNull();
    expect(validatePacProxyString("SOCKS5 127.0.0.1:1080; DIRECT")).toBeNull();
    expect(validatePacProxyString("HTTP proxy.example.com:8080")).toBeNull();
    expect(validatePacProxyString("HTTPS [::1]:8443")).toBeNull();
    expect(validatePacProxyString("SOCKS4 10.0.0.1:1080;")).toBeNull();
    expect(validatePacProxyString("SOCKS 192.168.1.1:1080")).toBeNull();
  });

  it("rejects empty entries", () => {
    expect(validatePacProxyString("PROXY 1.2.3.4:80;;DIRECT")).toBe(
      "代理项之间请使用分号分隔，不能包含空代理项。"
    );
    expect(validatePacProxyString(";")).toBe("代理项之间请使用分号分隔，不能包含空代理项。");
  });

  it("rejects unknown directives", () => {
    expect(validatePacProxyString("TUNNEL 1.2.3.4:80")).toBe(
      "第 1 项“TUNNEL 1.2.3.4:80”格式无效。请使用 PROXY、HTTP、HTTPS、SOCKS、SOCKS4、SOCKS5 或 DIRECT 指令。"
    );
  });

  it("rejects malformed endpoints", () => {
    expect(validatePacProxyString("PROXY 1.2.3.4")).toBe(
      "第 1 项代理地址格式无效，请使用 host:port；IPv6 地址请写成 [IPv6]:port。"
    );
    expect(validatePacProxyString("DIRECT; PROXY 1.2.3.4")).toBe(
      "第 2 项代理地址格式无效，请使用 host:port；IPv6 地址请写成 [IPv6]:port。"
    );
  });

  it("rejects out-of-range ports", () => {
    expect(validatePacProxyString("PROXY 1.2.3.4:0")).toBe(
      "第 1 项端口无效，端口范围必须是 1–65535。"
    );
    expect(validatePacProxyString("PROXY 1.2.3.4:70000")).toBe(
      "第 1 项端口无效，端口范围必须是 1–65535。"
    );
  });

  it("rejects invalid IPv6 and host values", () => {
    expect(validatePacProxyString("PROXY [1.2.3.4]:80")).toBe("第 1 项的 IPv6 地址无效。");
    expect(validatePacProxyString("PROXY bad_host!:80")).toBe(
      "第 1 项的代理主机名或 IP 地址无效。"
    );
    expect(validatePacProxyString("PROXY 999.1.1.1:80")).toBe(
      "第 1 项的代理主机名或 IP 地址无效。"
    );
  });

  it("accepts a trailing dot in hostnames", () => {
    expect(validatePacProxyString("PROXY proxy.example.com.:8080")).toBeNull();
  });
});

describe("probePacPilot", () => {
  it("reports the built-in engine", async () => {
    const probe = await probePacPilot();
    expect(probe.available).toBe(true);
    expect(probe.engine).toBe("builtin-remote-list");
    expect(probe.detail).toContain("Bun");
  });
});

describe("generatePac in custom mode", () => {
  it("renders a compressed PAC body", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: true });
    const result = await generatePac(storage);

    expect(result.success).toBe(true);
    expect(result.resultCode).toBe("custom.compressed");
    expect(result.resultData).toEqual({ compressed: true, obfuscated: false });
    expect(result.detail).toMatchObject({
      mode: "custom",
      compressed: true,
      obfuscated: false,
      parse: { custom_block_list: 1, custom_direct_list: 1 },
      output: { pac_path: "/pac" },
    });
    expect((result.detail as { output: { pac_bytes: number } }).output.pac_bytes).toBeGreaterThan(
      0
    );
    await storage.close();
  });

  it("serves the compressed body as a single line with no extra whitespace", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: true });
    await generatePac(storage);

    const rendered = await getRenderedPacBody(storage);
    // 整份响应只有一行：版本信息被压进块注释，正文没有换行。
    expect(rendered.body).not.toContain("\n");
    expect(rendered.body).toContain("/* PacPilot version: ");
    expect(rendered.body).toContain("function FindProxyForURL");
    // 去掉头部块注释与字符串字面量后只允许保留 `else if` 这类语法必需的单空格。
    const code = rendered.body
      .replace(/^\/\*[\s\S]*?\*\//, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");
    expect(code).not.toMatch(/\s{2,}/);
    expect(code.trim()).toBe(code);
    expect(rendered.compressed).toBe(true);
    expect(rendered.obfuscated).toBe(false);
    await storage.close();
  });

  it("obfuscates the body when obfuscation is enabled", async () => {
    const storage = await storageWith({
      mode: "custom",
      pacCompress: true,
      pacObfuscate: true,
    });
    const result = await generatePac(storage);

    expect(result.success).toBe(true);
    expect(result.resultCode).toBe("custom.obfuscated");
    expect(result.resultData).toEqual({ compressed: true, obfuscated: true });

    const rendered = await getRenderedPacBody(storage);
    expect(rendered.obfuscated).toBe(true);
    expect(rendered.compressed).toBe(true);
    // 混淆后仍是单行。
    expect(rendered.body).not.toContain("\n");
    // 全局入口与顶层变量名必须保留，PAC 客户端和状态页解析器都依赖它们。
    expect(rendered.body).toContain("FindProxyForURL");
    expect(rendered.body).toContain("BLOCK_LIST");
    // 字符串被抽进数组：原文里的域名不再以字面量出现。
    expect(rendered.body).toContain("_0x");
    await storage.close();
  });

  it("minifies even when only obfuscation is enabled", async () => {
    const storage = await storageWith({
      mode: "custom",
      pacCompress: false,
      pacObfuscate: true,
    });
    await generatePac(storage);

    const rendered = await getRenderedPacBody(storage);
    // 混淆必须先压缩，因此即使压缩开关关闭也输出单行。
    expect(rendered.body).not.toContain("\n");
    expect(rendered.compressed).toBe(true);
    expect(rendered.obfuscated).toBe(true);
    await storage.close();
  });

  it("produces identical bytes for identical obfuscated input", async () => {
    // 混淆器默认用随机种子，会让每次重建都生成不同的标识符与字符串数组，
    // ETag 随之每次变化，客户端缓存与条件请求全部失效。固定 seed 后必须可复现。
    const storage = await storageWith({ mode: "custom", pacCompress: true, pacObfuscate: true });
    await generatePac(storage);

    const strip = (body: string) => body.replace(/^\/\*[\s\S]*?\*\//, "");
    const bodies: string[] = [];
    for (let i = 0; i < 3; i++) {
      invalidateRenderedPac();
      const rendered = await getRenderedPacBody(storage, { force: true });
      bodies.push(strip(rendered.body));
      expect(rendered.obfuscated).toBe(true);
    }
    // 三次重建的混淆产物必须逐字节一致。
    expect(new Set(bodies).size).toBe(1);
    await storage.close();
  });

  it("keeps the readable body when compression is disabled", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    const result = await generatePac(storage);

    expect(result.success).toBe(true);
    expect(result.resultCode).toBe("custom.uncompressed");
    expect(result.resultData).toEqual({ compressed: false, obfuscated: false });

    const rendered = await getRenderedPacBody(storage);
    expect(rendered.body).toContain("function FindProxyForURL");
    expect(rendered.body).toContain("// PacPilot version:");
    await storage.close();
  });

  it("fails when the proxy string is invalid", async () => {
    const storage = await storageWith({ mode: "custom", pacProxy: "TUNNEL 1.2.3.4:80" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await generatePac(storage);

    expect(result.success).toBe(false);
    expect(result.resultCode).toBe("failed");
    expect(result.message).toContain("格式无效");
    expect(result.detail).toMatchObject({ mode: "custom" });
    expect(error).toHaveBeenCalled();
    await storage.close();
  });
});

describe("generatePac in remote mode", () => {
  it("fetches, persists and renders the remote list", async () => {
    vi.stubGlobal("fetch", jsonFetch("example.com\nother.example\n"));
    const storage = await storageWith({
      mode: "remote",
      listUrl: "https://list.example.com/gfwlist.txt",
    });

    const result = await generatePac(storage);
    expect(result.success).toBe(true);
    expect(result.resultCode).toBe("remote.plain");
    expect(result.resultData).toEqual({ proxy: 2, direct: 0 });

    const source = await readRuleSource(storage);
    expect(source).toMatchObject({
      url: "https://list.example.com/gfwlist.txt",
      format: "plain-domains",
      proxyHosts: ["example.com", "other.example"],
    });
    await storage.close();
  });

  it("reports the ABP format when the list uses ABP syntax", async () => {
    vi.stubGlobal("fetch", jsonFetch("||blocked.example^\n"));
    const storage = await storageWith({
      mode: "remote",
      listUrl: "https://list.example.com/abp.txt",
    });

    const result = await generatePac(storage);
    expect(result.success).toBe(true);
    expect(result.resultCode).toBe("remote.abp");
    await storage.close();
  });

  it("requires a list URL", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await generatePac(storage);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Remote list mode requires listUrl to be configured.");
    await storage.close();
  });

  it("reports fetch failures with the fetch metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await generatePac(storage);
    expect(result.success).toBe(false);
    expect(result.resultCode).toBe("failed");
    expect(String(result.message).length).toBeGreaterThan(0);
    await storage.close();
  });
});

describe("getRenderedPacBody", () => {
  it("reuses the cached render when the source version matches", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    const first = await getRenderedPacBody(storage);
    const second = await getRenderedPacBody(storage);

    expect(second.etag).toBe(first.etag);
    expect(second.builtAt).toBe(first.builtAt);
    await storage.close();
  });

  it("rebuilds when the settings change", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    const first = await getRenderedPacBody(storage);

    await storage.settings.set(
      settings({ mode: "custom", pacCompress: false, blockList: ["other.example"] })
    );
    const second = await getRenderedPacBody(storage);

    expect(second.etag).not.toBe(first.etag);
    expect(second.body).toContain("other.example");
    await storage.close();
  });

  it("rebuilds when forced", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    const first = await getRenderedPacBody(storage);
    const forced = await getRenderedPacBody(storage, { force: true });

    expect(forced.etag).toBe(first.etag);
    expect(forced).not.toBe(first);
    await storage.close();
  });

  it("collapses concurrent builds", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    const [first, second] = await Promise.all([
      getRenderedPacBody(storage),
      getRenderedPacBody(storage),
    ]);
    expect(second).toBe(first);
    await storage.close();
  });

  it("fails in remote mode without a rule snapshot", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });
    await expect(getRenderedPacBody(storage)).rejects.toThrow(
      "远程规则尚未拉取，请先在设置中保存远程规则模式。"
    );
    await storage.close();
  });

  it("renders the stored remote snapshot", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });
    await writeRuleSource(storage, {
      fetchedAt: "2026-10-25T00:00:00.000Z",
      url: "https://list.example.com/x",
      format: "plain-domains",
      proxyHosts: ["blocked.example"],
      directHosts: ["direct.example"],
    });

    const rendered = await getRenderedPacBody(storage);
    expect(rendered.body).toContain("blocked.example");
    // 默认设置开启压缩，因此头部是单行块注释而不是两行行注释。
    expect(rendered.body).toContain("/* PacPilot version:");
    await storage.close();
  });
});

describe("refreshRemoteRules", () => {
  it("refuses outside remote mode", async () => {
    const storage = await storageWith({ mode: "custom" });
    await expect(refreshRemoteRules(storage)).resolves.toEqual({
      ok: false,
      message: "当前不是远程规则模式，无需刷新。",
    });
    await storage.close();
  });

  it("refuses without a list URL", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "" });
    await expect(refreshRemoteRules(storage)).resolves.toEqual({
      ok: false,
      message: "远程规则模式需要先配置列表 URL。",
    });
    await storage.close();
  });

  it("refreshes and persists the snapshot", async () => {
    vi.stubGlobal("fetch", jsonFetch("fresh.example\n"));
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });

    const result = await refreshRemoteRules(storage);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("远程规则已刷新。");
    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const source = await readRuleSource(storage);
    expect(source?.proxyHosts).toEqual(["fresh.example"]);
    await storage.close();
  });

  it("returns the failure message when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 }))
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });

    const result = await refreshRemoteRules(storage);
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
    await storage.close();
  });
});

describe("warmPacCache", () => {
  it("renders custom rules at startup", async () => {
    const storage = await storageWith({ mode: "custom", pacCompress: false });
    await warmPacCache(storage);
    const rendered = await getRenderedPacBody(storage);
    expect(rendered.body).toContain("blocked.example");
    await storage.close();
  });

  it("skips rendering in remote mode without a snapshot", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await warmPacCache(storage);
    expect(String(warn.mock.calls[0]!.join(" "))).toContain("no rule snapshot exists yet");
    await storage.close();
  });

  it("renders the stored snapshot in remote mode", async () => {
    const storage = await storageWith({ mode: "remote", listUrl: "https://list.example.com/x" });
    await writeRuleSource(storage, {
      fetchedAt: "2026-10-25T00:00:00.000Z",
      url: "https://list.example.com/x",
      format: "plain-domains",
      proxyHosts: ["warm.example"],
      directHosts: [],
    });

    await warmPacCache(storage);
    const rendered = await getRenderedPacBody(storage);
    expect(rendered.body).toContain("warm.example");
    await storage.close();
  });

  it("swallows rendering failures", async () => {
    const storage = await createMemoryApplicationStorage();
    await storage.settings.set(settings({ mode: "remote", listUrl: "https://list.example.com/x" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // No snapshot: warmPacCache warns instead of throwing. Force a throw by breaking settings.
    vi.spyOn(storage.settings, "get").mockRejectedValueOnce(new Error("settings unavailable"));
    await expect(warmPacCache(storage)).resolves.toBeUndefined();
    expect(String(error.mock.calls[0]!.join(" "))).toContain("Unable to warm the PAC cache");
    await storage.close();
  });
});
