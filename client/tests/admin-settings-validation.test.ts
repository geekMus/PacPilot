import { describe, expect, it } from "vitest";
import type { WebhookConfig } from "../../shared/contracts";
import { createAdminSettingsValidators } from "../src/utils/admin-settings-validation";

const t = (key: string, params?: Record<string, unknown>) =>
  params ? key + ":" + JSON.stringify(params) : key;

function webhook(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    provider: "custom",
    url: "",
    method: "POST",
    headers: "{}",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    testBody: "",
    messageTemplate: "",
    testMessageTemplate: "",
    ...overrides,
  };
}

const validators = createAdminSettingsValidators(t);

describe("looksLikeUrl", () => {
  it("accepts HTTP(S) URLs without credentials", () => {
    expect(validators.looksLikeUrl("https://hooks.example.com/path")).toBe(true);
    expect(validators.looksLikeUrl("http://127.0.0.1:8080")).toBe(true);
  });

  it("rejects unsupported schemes, malformed URLs and credentials", () => {
    expect(validators.looksLikeUrl("ftp://example.com")).toBe(false);
    expect(validators.looksLikeUrl("https://user:pass@example.com")).toBe(false);
    expect(validators.looksLikeUrl("not a url")).toBe(false);
  });
});

describe("validateWebhookDraft", () => {
  it("accepts a valid custom webhook and empty optional JSON bodies", () => {
    expect(
      validators.validateWebhookDraft(webhook({ url: "https://example.com/hook" }), "success")
    ).toEqual({ url: "", headers: "", body: "", testBody: "", secret: "" });
  });

  it("requires a URL when custom body or headers are configured", () => {
    const result = validators.validateWebhookDraft(webhook({ body: '{"ok":true}' }), "failure");
    expect(result.url).toContain("settings.webhookNeedUrlForBody");
  });

  it("rejects invalid URLs and non-object JSON bodies", () => {
    const result = validators.validateWebhookDraft(
      webhook({ url: "bad", body: "42", testBody: "true" }),
      "test"
    );
    expect(result.url).toContain("settings.webhookNeedUrl");
    expect(result.body).toContain("settings.webhookBodyError");
    expect(result.testBody).toContain("settings.webhookTestBodyError");
  });

  it("rejects malformed headers and unsafe transport headers", () => {
    expect(validators.validateWebhookDraft(webhook({ headers: "{" }), "x").headers).toContain(
      "settings.headersJsonError"
    );
    expect(
      validators.validateWebhookDraft(webhook({ headers: '{"Host":"x"}' }), "x").headers
    ).toContain("settings.headersTransport");
    expect(
      validators.validateWebhookDraft(webhook({ headers: '{"X-Test":12}' }), "x").headers
    ).toContain("settings.headersMustStrings");
    expect(validators.validateWebhookDraft(webhook({ headers: "[]" }), "x").headers).toContain(
      "settings.webhookHeadersError"
    );
    expect(
      validators.validateWebhookDraft(webhook({ headers: '{"X-Test":"a\\r\\nb"}' }), "x").headers
    ).toContain("settings.headersTransport");
  });

  it("validates DingTalk access token and signing secret", () => {
    const missingToken = validators.validateWebhookDraft(
      webhook({
        provider: "dingtalk",
        url: "https://oapi.dingtalk.com/robot/send",
        dingTalkSecret: "secret",
      }),
      "success"
    );
    expect(missingToken.url).toContain("settings.dingTalkToken");
    const missingSecret = validators.validateWebhookDraft(
      webhook({
        provider: "dingtalk",
        url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
      }),
      "success"
    );
    expect(missingSecret.secret).toContain("settings.dingTalkSecret");
    expect(
      validators.validateWebhookDraft(
        webhook({ provider: "dingtalk", dingTalkSecret: "secret" }),
        "x"
      ).url
    ).toContain("settings.dingTalkSecretNeedsUrl");
    // 编辑已有渠道时密钥不回显，留空表示沿用已保存的密钥，不应报错。
    const keepsSavedSecret = validators.validateWebhookDraft(
      webhook({
        provider: "dingtalk",
        url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
      }),
      "success",
      { hasSavedSecret: true }
    );
    expect(keepsSavedSecret.secret).toBe("");
    expect(keepsSavedSecret.url).toBe("");
  });
});

describe("PAC and domain validation", () => {
  it("accepts supported proxy directives and optional final semicolons", () => {
    expect(validators.validatePacProxyString("DIRECT")).toBeNull();
    expect(
      validators.validatePacProxyString("PROXY proxy.example.com:8080; SOCKS5 [2001:db8::1]:1080;")
    ).toBeNull();
  });

  it("rejects empty items, invalid endpoints, ports and hosts", () => {
    for (const value of [
      "",
      "DIRECT;;PROXY proxy.example.com:8080",
      "UNKNOWN proxy.example.com:8080",
      "PROXY host",
      "PROXY host:0",
      "PROXY host:65536",
      "PROXY 999.1.1.1:8080",
      "SOCKS5 [not-ipv6]:1080",
    ]) {
      expect(validators.validatePacProxyString(value)).not.toBeNull();
    }
  });

  it("validates domain rules using the matching list", () => {
    expect(validators.validateDomainRules("example.com", "direct")).toBeNull();
    expect(validators.validateDomainRules("bad*host", "direct")).toContain(
      "settings.domainLineError"
    );
    expect(validators.validateDomainRules("bad*host", "block")).toContain(
      "settings.domainLineError"
    );
  });

  it("collects all non-empty webhook errors", () => {
    expect(
      validators.webhookErrorMessages({
        url: "url",
        headers: "",
        body: "body",
        testBody: "",
        secret: "secret",
      })
    ).toEqual(["url", "body", "secret"]);
  });
});
