import { describe, expect, test } from "bun:test";
import type { WebhookConfig } from "../shared/contracts";
import { createAdminSettingsValidators } from "../client/src/utils/admin-settings-validation";

const validators = createAdminSettingsValidators((key: string) => key);

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

describe("admin settings validation helpers", () => {
  test("validates proxy protocol, host and port", () => {
    expect(validators.validatePacProxyString("PROXY 127.0.0.1:7890")).toBeNull();
    expect(validators.validatePacProxyString("SOCKS5 [::1]:1080")).toBeNull();
    expect(validators.validatePacProxyString("PROXY example.com:0")).toBe("settings.proxyPortInvalid");
    expect(validators.validatePacProxyString("PROXY invalid_host:7890")).toBe("settings.proxyHostnameInvalid");
  });

  test("rejects dangerous or malformed custom webhook headers", () => {
    const invalid = validators.validateWebhookDraft(
      webhook({
        url: "https://hooks.example.com/notify",
        headers: JSON.stringify({ "Content-Length": "99" }),
      }),
      "success"
    );
    expect(invalid.headers).toBe("successsettings.headersTransport");
  });

  test("requires a URL when custom request body or headers are configured", () => {
    const invalid = validators.validateWebhookDraft(
      webhook({ body: JSON.stringify({ message: "hello" }) }),
      "failure"
    );
    expect(invalid.url).toBe("settings.webhookNeedUrlForBody");
  });

  test("validates domain rules through the shared analyzer", () => {
    expect(validators.validateDomainRules("example.com", "settings.directList")).toBeNull();
    expect(validators.validateDomainRules("||example.com", "settings.directList")).toBe(
      "settings.domainLineError"
    );
  });
});
