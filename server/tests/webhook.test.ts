import { describe, expect, it } from "vitest";
import { createDefaultWebhookConfig } from "../domain/settings";
import { validateWebhookConfig } from "../services/webhook";

function config(overrides: Record<string, unknown> = {}) {
  return {
    ...createDefaultWebhookConfig(),
    url: "https://example.com/hook",
    ...overrides,
  } as ReturnType<typeof createDefaultWebhookConfig>;
}

describe("validateWebhookConfig", () => {
  it("rejects an empty URL and non-HTTP schemes", () => {
    expect(validateWebhookConfig(config({ url: "" }))).toContain("Webhook URL不能为空。");
    expect(validateWebhookConfig(config({ url: "ftp://example.com/hook" }))).toEqual([
      expect.stringContaining("must use the HTTP or HTTPS scheme"),
    ]);
  });

  it("blocks loopback and metadata targets so webhooks cannot probe the host", () => {
    for (const url of [
      "http://127.0.0.1/hook",
      "http://localhost/hook",
      "http://metadata.goog/hook",
    ]) {
      expect(validateWebhookConfig(config({ url }))).toEqual([
        expect.stringContaining("loopback or cloud metadata"),
      ]);
    }
  });

  it("allows LAN webhook targets for self-hosted deployments", () => {
    expect(validateWebhookConfig(config({ url: "http://192.168.1.10:8080/hook" }))).toEqual([]);
  });

  it("requires valid JSON for body, test body and headers", () => {
    expect(validateWebhookConfig(config({ body: "{oops" }))).toEqual([
      expect.stringContaining("Webhook Body不是合法 JSON"),
    ]);
    expect(validateWebhookConfig(config({ testBody: "[1,2" }))).toEqual([
      expect.stringContaining("Webhook 测试 Body不是合法 JSON"),
    ]);
    expect(validateWebhookConfig(config({ headers: "not json" }))).toEqual([
      expect.stringContaining("请求头不是合法 JSON"),
    ]);
    // A top-level array is accepted for bodies, but headers must be an object.
    expect(validateWebhookConfig(config({ headers: "[1]" }))).toEqual([
      expect.stringContaining("请求头必须是 JSON 对象"),
    ]);
  });

  it("rejects header names or values that could break the transport", () => {
    expect(validateWebhookConfig(config({ headers: '{"Content-Type":"text/plain"}' }))).toEqual([
      expect.stringContaining("不允许覆盖的传输字段"),
    ]);
    expect(validateWebhookConfig(config({ headers: '{"X-Test":"a\\nb"}' }))).toEqual([
      expect.stringContaining("不允许覆盖的传输字段"),
    ]);
    expect(validateWebhookConfig(config({ headers: '{"X-Test":123}' }))).toEqual([
      expect.stringContaining("名称: 字符串值"),
    ]);
    expect(validateWebhookConfig(config({ headers: '{"Authorization":"Bearer ok"}' }))).toEqual([]);
  });

  it("requires a DingTalk robot URL with an access token", () => {
    expect(
      validateWebhookConfig(config({ provider: "dingtalk", url: "https://oapi.dingtalk.com/robot/send" }))
    ).toEqual([
      expect.stringContaining("缺少 access_token"),
    ]);

    // 未启用加签的钉钉机器人同样合法：access_token 必填，Secret 可留空。
    const unsigned = config({
      provider: "dingtalk",
      url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
      dingTalkSecret: "",
    });
    expect(validateWebhookConfig(unsigned)).toEqual([]);

    const signed = config({
      provider: "dingtalk",
      url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
      dingTalkSecret: "SECabc",
    });
    expect(validateWebhookConfig(signed)).toEqual([]);
  });
});
