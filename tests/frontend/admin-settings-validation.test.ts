import { describe, expect, test } from "bun:test";
import type { WebhookConfig } from "../../shared/contracts";
import { createAdminSettingsValidators } from "../../client/src/utils/admin-settings-validation";

const t = (key: string) => key;
const validators = createAdminSettingsValidators(t);

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

describe("frontend admin settings validators", () => {
  test.each([
    ["PROXY 127.0.0.1:7890", null],
    ["SOCKS5 [::1]:1080", null],
    ["PROXY example.com:0", "settings.proxyPortInvalid"],
    ["PROXY invalid_host:7890", "settings.proxyHostnameInvalid"],
    ["PROXY example.com:7890;;DIRECT", "settings.proxySemicolon"],
  ])("validates proxy directive %s", (value, expected) => {
    expect(validators.validatePacProxyString(value)).toBe(expected);
  });

  test("rejects custom webhook headers that can corrupt HTTP framing", () => {
    const errors = validators.validateWebhookDraft(
      webhook({
        url: "https://hooks.example.com/notify",
        headers: JSON.stringify({ "Content-Length": "123" }),
      }),
      "success"
    );
    expect(errors.headers).toBe("successsettings.headersTransport");
    expect(validators.webhookErrorMessages(errors)).toContain("successsettings.headersTransport");
  });

  test("requires a URL when body or non-default headers are configured", () => {
    const bodyErrors = validators.validateWebhookDraft(webhook({ body: '{"message":"hello"}' }), "failure");
    expect(bodyErrors.url).toBe("settings.webhookNeedUrlForBody");

    const headerErrors = validators.validateWebhookDraft(webhook({ headers: '{"X-Trace":"1"}' }), "failure");
    expect(headerErrors.url).toBe("settings.webhookNeedUrlForBody");
  });

  test("validates DingTalk access token and secret as a pair", () => {
    const missingToken = validators.validateWebhookDraft(
      webhook({ provider: "dingtalk", url: "https://oapi.dingtalk.com/robot/send", dingTalkSecret: "secret" }),
      "success"
    );
    expect(missingToken.url).toBe("settings.dingTalkToken");

    const missingSecret = validators.validateWebhookDraft(
      webhook({ provider: "dingtalk", url: "https://oapi.dingtalk.com/robot/send?access_token=token" }),
      "success"
    );
    expect(missingSecret.secret).toBe("settings.dingTalkSecret");

    const valid = validators.validateWebhookDraft(
      webhook({ provider: "dingtalk", url: "https://oapi.dingtalk.com/robot/send?access_token=token", dingTalkSecret: "secret" }),
      "success"
    );
    expect(validators.webhookErrorMessages(valid)).toEqual([]);
  });

  test("returns stable domain-rule errors for unsupported wildcard syntax", () => {
    expect(validators.validateDomainRules("foo.*.example.com", "settings.directList")).toBe("settings.domainLineError");
    expect(validators.validateDomainRules("example.com", "settings.directList")).toBeNull();
  });
});
