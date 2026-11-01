import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPacBody } from "../services/pac-build-client";

const TEST_WORKER_PATH = fileURLToPath(
  new URL("./fixtures/pac-build-test-worker.ts", import.meta.url)
);

const SAMPLE_PAC = `function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, "blocked.example")) {
    return "PROXY 127.0.0.1:1080";
  }
  return "DIRECT";
}`;

describe("PAC 构建子进程", () => {
  it("压缩后输出单行代码", async () => {
    const code = await buildPacBody({
      code: SAMPLE_PAC,
      compress: true,
      obfuscate: false,
      locale: "zh_CN",
    });

    expect(code).not.toContain("\n");
    expect(code).toContain("FindProxyForURL");
  }, 30_000);

  it("混淆后抽出字符串字面量", async () => {
    const code = await buildPacBody({
      code: SAMPLE_PAC,
      compress: true,
      obfuscate: true,
      locale: "zh_CN",
    });

    expect(code).toContain("_0x");
    expect(code).not.toContain("\n");
  }, 30_000);

  it("相同输入产出逐字节一致的结果", async () => {
    const request = {
      code: SAMPLE_PAC,
      compress: true,
      obfuscate: true,
      locale: "zh_CN" as const,
    };

    const first = await buildPacBody(request);
    const second = await buildPacBody(request);

    expect(first).toBe(second);
  }, 60_000);

  it("代码非法时把构建失败抛出来", async () => {
    await expect(
      buildPacBody({ code: "function (", compress: true, obfuscate: false, locale: "zh_CN" })
    ).rejects.toThrow();
  }, 30_000);

  it("子进程报告构建失败时抛出原始报错", async () => {
    await expect(
      buildPacBody(
        { code: "__failed__", compress: true, obfuscate: false, locale: "zh_CN" },
        { workerPath: TEST_WORKER_PATH }
      )
    ).rejects.toThrow("构建失败");
  }, 30_000);

  it("子进程脚本缺失时给出明确报错", async () => {
    await expect(
      buildPacBody(
        { code: SAMPLE_PAC, compress: true, obfuscate: false, locale: "zh_CN" },
        { workerPath: "D:/__pacpilot_missing__/pac-build-worker.ts" }
      )
    ).rejects.toThrow("没有返回结果");
  }, 30_000);

  it("子进程无法启动时给出明确报错", async () => {
    await expect(
      buildPacBody(
        { code: SAMPLE_PAC, compress: true, obfuscate: false, locale: "zh_CN" },
        { runtimePath: "D:/__pacpilot_missing__/bun.exe" }
      )
    ).rejects.toThrow("无法启动 PAC 构建子进程");
  }, 30_000);

  it("子进程超时后终止构建", async () => {
    await expect(
      buildPacBody(
        { code: SAMPLE_PAC, compress: true, obfuscate: false, locale: "zh_CN" },
        { timeoutMs: 1 }
      )
    ).rejects.toThrow("超时");
  }, 30_000);

  it("子进程没有返回结果时报错", async () => {
    await expect(
      buildPacBody(
        { code: "__empty__", compress: true, obfuscate: false, locale: "zh_CN" },
        { workerPath: TEST_WORKER_PATH }
      )
    ).rejects.toThrow("没有返回结果");
  }, 30_000);

  it("子进程返回无法解析的结果时报错", async () => {
    await expect(
      buildPacBody(
        { code: "__garbled__", compress: true, obfuscate: false, locale: "zh_CN" },
        { workerPath: TEST_WORKER_PATH }
      )
    ).rejects.toThrow("无法解析");
  }, 30_000);

  it("子进程没有返回产物时报错", async () => {
    await expect(
      buildPacBody(
        { code: "__nocode__", compress: true, obfuscate: false, locale: "zh_CN" },
        { workerPath: TEST_WORKER_PATH }
      )
    ).rejects.toThrow("没有返回产物");
  }, 30_000);
});
