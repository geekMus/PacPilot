import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { createApp } from "../app";
import type { EnvConfig } from "../config/env";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { createApplicationStorage } from "../storage";
import type { ApplicationStorage } from "../storage/repositories";

/**
 * `/pac` 必须始终带 `Content-Encoding`：默认配置没有任何规则时产物只有 1KB 左右，
 * 正好落在 compression() 的默认阈值之下，曾经因此完全不压缩（开关打开也看不出效果）。
 * 这里用真实的 HTTP 请求验证压缩确实发生，并确认只压缩一次。
 */
interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function request(
  base: string,
  path: string,
  headers: http.OutgoingHttpHeaders = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${path}`, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
      );
    });
    req.on("error", reject);
  });
}

describe("PAC 传输压缩", () => {
  let server: Server;
  let base = "";
  let storage: ApplicationStorage;

  beforeAll(async () => {
    storage = await createApplicationStorage({ storageDriver: "memory", dataDir: "" });
    const env: EnvConfig = {
      dataDir: "",
      storageDriver: "memory",
      runtimeProfile: "development",
      port: 0,
      host: "127.0.0.1",
      corsMode: "strict",
      trustProxyHops: 0,
      trustCloudflareIp: false,
      trustedProxyCidrs: [],
    };
    const app = createApp(env, storage);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("compresses a PAC body smaller than the default 1KB threshold", async () => {
    storage.settings.set({ ...DEFAULT_SETTINGS });
    const plain = await request(base, "/pac");
    const text = plain.body.toString("utf8");
    // 前提校验：这份产物必须真的在 1KB 阈值之下，否则本用例就测不到目标缺陷。
    expect(text.length).toBeLessThan(1024);
    expect(text).toContain("FindProxyForURL");
    expect(plain.headers["content-encoding"]).toBeUndefined();

    const compressed = await request(base, "/pac", { "accept-encoding": "gzip" });
    expect(compressed.headers["content-encoding"]).toBe("gzip");
    expect(compressed.headers["x-pac-compressed"]).toBe("1");
    expect(gunzipSync(compressed.body).toString("utf8")).toBe(text);
  });

  it("compresses a large PAC exactly once", async () => {
    storage.settings.set({
      ...DEFAULT_SETTINGS,
      directList: Array.from({ length: 200 }, (_, i) => `domain-${i}.example.com`),
    });
    const compressed = await request(base, "/pac", { "accept-encoding": "gzip" });
    expect(compressed.headers["content-encoding"]).toBe("gzip");

    // 只解压一次就必须得到 PAC 文本：若被二次压缩，这里拿到的会是 gzip 魔数。
    const text = gunzipSync(compressed.body).toString("utf8");
    expect(text).toContain("FindProxyForURL");
    expect(text).toContain("domain-199.example.com");
  });

  it("keeps the download variant compressed as well", async () => {
    storage.settings.set({ ...DEFAULT_SETTINGS });
    const res = await request(base, "/pac?download=1", { "accept-encoding": "gzip" });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="proxy.pac"');
    expect(gunzipSync(res.body).toString("utf8")).toContain("FindProxyForURL");
  });

  it("serves a single-line body without a trailing newline", async () => {
    storage.settings.set({ ...DEFAULT_SETTINGS });
    const res = await request(base, "/pac");
    const text = res.body.toString("utf8");
    // 压缩态的头部被折成一个块注释，整份响应只有一行。
    expect(text.split("\n")).toHaveLength(1);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("reports the obfuscation state in X-Pac-Obfuscated", async () => {
    storage.settings.set({ ...DEFAULT_SETTINGS });
    const plain = await request(base, "/pac");
    expect(plain.headers["x-pac-obfuscated"]).toBe("0");

    storage.settings.set({ ...DEFAULT_SETTINGS, pacObfuscate: true });
    const obfuscated = await request(base, "/pac", { "accept-encoding": "gzip" });
    expect(obfuscated.headers["x-pac-obfuscated"]).toBe("1");
    expect(obfuscated.headers["x-pac-compressed"]).toBe("1");
    const text = gunzipSync(obfuscated.body).toString("utf8");
    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("FindProxyForURL");
    expect(text).toContain("_0x");
  });
});
